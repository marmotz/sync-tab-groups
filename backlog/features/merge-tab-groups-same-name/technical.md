# Conception technique — Fusion de groupes homonymes

Réf. produit : [overview.md](overview.md)

## État actuel du code

- `openGroup(syncId, group)` — [src/lib/groupActions.ts:132](../../../src/lib/groupActions.ts)
  crée inconditionnellement les onglets, `browser.tabs.group`, `setMapping`,
  `setSnapshot`. Aucun regard sur les groupes locaux existants.
- Appel unique depuis le popup : `renderClosedSection` →
  [src/popup/popup.ts:177](../../../src/popup/popup.ts)
  (`void openGroup(info.syncId, info.group).then(scheduleRender)`).
- `listUnsharedLocalGroups()` — [src/lib/groupActions.ts:54](../../../src/lib/groupActions.ts)
  renvoie déjà `{ localGroupId, title, color, tabCount }` pour les groupes non mappés.
- `shareGroup(localGroupId)` — [src/lib/groupActions.ts:120](../../../src/lib/groupActions.ts) :
  `readLocalGroupState(id, syncId, deviceId)` puis `setSyncedGroup` + `setMapping` +
  `setSnapshot`. Génère un `syncId` neuf ; ici il faudra **réutiliser le syncId existant**.
- `applyRemoteGroup(localGroupId, remoteGroup)` — [src/lib/reconciler.ts:51](../../../src/lib/reconciler.ts)
  aligne le contenu d'un groupe local sur un groupe distant (remove/create/move par URL).
- `computeReconcileActions` — [src/lib/reconciler.ts:19](../../../src/lib/reconciler.ts) :
  diff pur, **supprime** les onglets locaux non présents à distance → pas réutilisable tel quel pour la fusion (qui ne
  supprime rien).
- `readLocalGroupState` — [src/lib/localState.ts:4](../../../src/lib/localState.ts) accepte un `syncId` en paramètre :
  on peut lui passer le syncId existant.
- i18n : `browser.i18n.getMessage` via `t()` ; messages dans
  `public/_locales/{fr,en}/messages.json`.
- Popup : rendu 100 % impératif, pas de modale. `groupRow(...)` construit une ligne ;
  `makeButton(label, onClick, variant?)`.

## Décisions techniques

### 1. Détection de l'homonyme — couche `lib`

Nouvelle fonction pure dans `src/lib/groupActions.ts` (ou `model.ts`) :

```ts
export function normalizeGroupTitle(title: string): string {
  return title.trim().toLowerCase();
}
```

Nouvelle fonction :

```ts
export async function findLocalNameConflicts(title: string): Promise<LocalGroupInfo[]>
```

- s'appuie sur `listUnsharedLocalGroups()` ;
- filtre `normalizeGroupTitle(info.title) === normalizeGroupTitle(title)` ;
- garde l'ordre d'affichage déjà produit par `listUnsharedLocalGroups`.

`openGroup` **n'est pas** modifié pour appeler cette détection lui-même : le popup interroge `findLocalNameConflicts`
avant de décider quoi afficher. Raison : garder
`openGroup` comme primitive « ouvre, sans poser de question » (réutilisée par la réconciliation « garder le cloud » et
potentiellement ailleurs).

### 2. Nouvelles primitives de réconciliation — `src/lib/groupActions.ts`

Toutes prennent le `syncId` **déjà existant** du groupe synchronisé et le
`localGroupId` du groupe local cible. Toutes terminent par le même trio
`setMapping(localGroupId, syncId)` + `setSyncedGroup(state)` + `setSnapshot(syncId, state)`
où `state = await readLocalGroupState(localGroupId, syncId, deviceId)` **relu après**
mutation des onglets, afin que cloud + snapshot reflètent l'état final (lien + push immédiat, cf. overview).

| Fonction                                            | Mutation locale avant le trio                  |
|-----------------------------------------------------|------------------------------------------------|
| `adoptLocalOverSynced(syncId, localGroupId)`        | aucune — le groupe local est déjà l'état voulu |
| `adoptSyncedOverLocal(syncId, localGroupId, group)` | `applyRemoteGroup(localGroupId, group)`        |
| `mergeLocalAndSynced(syncId, localGroupId, group)`  | ajoute les onglets distants absents (voir §3)  |

Pour `adoptSyncedOverLocal`, après `applyRemoteGroup` le contenu local est identique au distant ; le re-`setSyncedGroup`
ne fait que rafraîchir `updatedAt/updatedBy`. Acté : on garde le trio uniforme pour un seul chemin de code.

Note `readLocalGroupState` : il lit `tabGroup.color`/`title` **locaux**. Donc « garder mes onglets » et « fusionner »
propagent aussi la couleur/titre du groupe local vers le cloud. Cohérent avec « garder mes onglets ».

### 3. Fusion — nouvelle fonction pure dans `src/lib/reconciler.ts`

```ts
export function computeMergeAdditions(localUrls: string[], remoteTabs: SyncedTab[]): SyncedTab[]
```

- retourne les `remoteTabs` dont l'`url` n'est **pas** dans `localUrls` (égalité exacte, `Set` pour la dédup) ;
- conserve l'ordre relatif des onglets distants.

`mergeLocalAndSynced` :

1. `localUrls` = URLs des onglets du groupe local (`browser.tabs.query({ groupId })`) ;
2. `additions = computeMergeAdditions(localUrls, group.tabs)` ;
3. pour chaque addition : `browser.tabs.create({ url, windowId, active: false })` puis
   `browser.tabs.group({ tabIds, groupId: localGroupId })` — append en fin de groupe ⇒ **onglets locaux d'abord, puis
   distants** (cf. overview) ;
4. trio de clôture.

Pas de gestion fine d'index : l'append suffit pour l'ordre décidé.

### 4. Renommage local — `src/lib/groupActions.ts`

```ts
export async function renameLocalGroupToAvoidConflict(localGroupId: number, baseTitle: string): Promise<void>
```

- calcule un titre libre à partir de `baseTitle` :
  `"<base> (local)"`, puis `"<base> (local 2)"`, `"<base> (local 3)"`… en s'arrêtant au premier qui n'entre en collision
  (via `normalizeGroupTitle`) avec **aucun** groupe
  `browser.tabGroups.query({})` ni aucun groupe synchronisé (`getAllSyncedGroups`) ;
- `browser.tabGroups.update(localGroupId, { title })`.

Le popup enchaîne ensuite `openGroup(syncId, group)` normalement : plus de conflit, deux groupes distincts.

### 5. UI popup — `src/popup/popup.ts`

`renderClosedSection` : le bouton « Ouvrir » ne câble plus directement `openGroup`. Au clic :

1. `const conflicts = await findLocalNameConflicts(info.group.title)` ;
2. si `conflicts.length === 0` → `openGroup(...)` comme aujourd'hui ;
3. sinon → déplier une **zone de choix sous la ligne** (pas de modale, cf. overview).

Zone dépliée, **2 étapes** quand `conflicts.length > 1` :

- **Étape 1** (seulement si > 1 conflit) : titre « Fusionner avec quel groupe local ? » + un bouton par groupe local
  (`titre (n onglets)`). Un clic fixe la cible et passe à l'étape 2.
- **Étape 2** : phrase « Un groupe nommé "x" existe déjà. » + 5 boutons :

| Bouton (clé i18n)                                        | Handler                                                                          |
|----------------------------------------------------------|----------------------------------------------------------------------------------|
| `mergeChoiceRenameLocal` — « Renommer le groupe local »  | `renameLocalGroupToAvoidConflict(target, title)` puis `openGroup(syncId, group)` |
| `mergeChoiceKeepLocal` — « Garder mes onglets »          | `adoptLocalOverSynced(syncId, target)`                                           |
| `mergeChoiceKeepCloud` — « Garder les onglets du cloud » | `adoptSyncedOverLocal(syncId, target, group)`                                    |
| `mergeChoiceMerge` — « Fusionner »                       | `mergeLocalAndSynced(syncId, target, group)`                                     |
| `buttonCancel` (existe déjà) — « Annuler »               | referme la zone, aucune action                                                   |

Chaque handler `.then(scheduleRender)`. Gestion d'état de la zone dépliée : variable locale au closure de la ligne (ex.
`let expandedFor: number | null`), rerender complet via `scheduleRender` après action. Pendant l'action, boutons
`disabled` (déjà le comportement de `makeButton`).

Helper à ajouter : `renderConflictChoice(info, conflicts, onDone)` renvoyant un
`HTMLElement` inséré après la `group-row`.

### 6. i18n

Nouvelles clés dans `public/_locales/fr/messages.json` **et** `en/messages.json` :

| clé                      | fr                                      | en                                     |
|--------------------------|-----------------------------------------|----------------------------------------|
| `mergeConflictHeading`   | Un groupe nommé « $NAME$ » existe déjà. | A group named “$NAME$” already exists. |
| `mergePickLocalHeading`  | Fusionner avec quel groupe local ?      | Merge with which local group?          |
| `mergeChoiceRenameLocal` | Renommer le groupe local                | Rename the local group                 |
| `mergeChoiceKeepLocal`   | Garder mes onglets locaux               | Keep my local tabs                     |
| `mergeChoiceKeepCloud`   | Garder les onglets du cloud             | Keep the cloud tabs                    |
| `mergeChoiceMerge`       | Fusionner                               | Merge                                  |
| `localGroupSuffix`       | local                                   | local                                  |

`mergeConflictHeading` utilise une substitution (`$NAME$`) — placeholders au format
`messages.json` (`"placeholders": { "name": { "content": "$1" } }`), `t(key, [name])`.

### 7. Conséquences vérifiées

- `openGroup` inchangé → tests existants (`groupActions.test.ts`, `reconciler-apply`)
  non impactés.
- `computeReconcileActions` inchangé (nouvelle fonction séparée pour la fusion).
- `storage.onChanged` déclenche déjà un `scheduleRender` (popup.ts:193) ; le trio de clôture provoque le passage de la
  ligne de « fermé » à « ouvert » automatiquement.
- Course : si le groupe synchronisé est supprimé à distance pendant que la zone est dépliée, les handlers `adopt*`/
  `merge*` écriront quand même sous l'ancien `syncId`. Acté comme acceptable (même niveau de risque que les actions
  actuelles du popup).
- Le device qui « garde le cloud » : `applyRemoteGroup` peut fermer des onglets locaux. C'est le sens explicite de
  l'option (overview : « remplacer »).

## Alternatives écartées

- **Modale `<dialog>`** : rejetée en discussion produit (zone dépliée retenue).
- **Réutiliser `computeReconcileActions` pour la fusion** en filtrant les `removeTab` :
  fragile (la sémantique « garder tout le local » n'est pas ce que la fonction modélise) ; une fonction dédiée
  `computeMergeAdditions` est triviale et testable.
- **Faire porter la détection par `openGroup`** : mélangerait UI (poser une question)
  et primitive ; le popup reste l'orchestrateur.
- **Matching insensible aux accents / fuzzy** : hors périmètre (overview).

## Découpage en tâches d'implémentation

Issues GitHub non créées. Identifiants locaux `x1`..`x5` (à passer à `/implement-issue`).

1. [x1-detect-local-name-conflicts.md](../../tasks/x1-detect-local-name-conflicts.md) — `normalizeGroupTitle` +
   `findLocalNameConflicts` (§1).
2. [x2-compute-merge-additions.md](../../tasks/x2-compute-merge-additions.md) — fonction pure `computeMergeAdditions`
   (§3).
3. [x3-reconciliation-primitives.md](../../tasks/x3-reconciliation-primitives.md) — `adoptLocalOverSynced` /
   `adoptSyncedOverLocal` / `mergeLocalAndSynced` / `renameLocalGroupToAvoidConflict` (§2, §4). Dépend de 2 et 1.
4. [x4-i18n-merge-keys.md](../../tasks/x4-i18n-merge-keys.md) — clés fr/en (§6).
5. [x5-popup-conflict-choice-ui.md](../../tasks/x5-popup-conflict-choice-ui.md) — zone de choix dépliée dans le popup
   (§5). Dépend de 1, 3, 4.
