# front — zone de choix de fusion dans le popup

**Réf. tâche** : x5
**Statut** : fait
**Type** : front
**Issue** :

Référence : [../features/merge-tab-groups-same-name/technical.md §5](../features/merge-tab-groups-same-name/technical.md#5-ui-popup--srcpopuppopupts).

## Constat vérifié

- `renderClosedSection` ([src/popup/popup.ts:169](../../src/popup/popup.ts)) câble
  aujourd'hui `openBtn` directement sur `openGroup(info.syncId, info.group)`.
- Rendu impératif, pas de modale. Helpers `groupRow(...)`, `makeButton(label, onClick, variant?)`,
  `section(...)`, `scheduleRender()`.
- `storage.onChanged` déclenche déjà `scheduleRender` (popup.ts:193).

## À faire

1. Au clic sur « Ouvrir » : `const conflicts = await findLocalNameConflicts(info.group.title)`.
   - `conflicts.length === 0` → `openGroup(...)` comme aujourd'hui.
   - sinon → afficher une zone dépliée insérée après la ligne du groupe (pas de modale).
2. Nouveau helper `renderConflictChoice(info, conflicts, onCancel): HTMLElement` :
   - **Étape 1** (uniquement si `conflicts.length > 1`) : titre `t('mergePickLocalHeading')`
     + un bouton par groupe local (`titre (n)`) fixant la cible puis passant à l'étape 2.
   - **Étape 2** : `t('mergeConflictHeading', [info.group.title])` + 5 boutons :
     - `mergeChoiceRenameLocal` → `renameLocalGroupToAvoidConflict(target, info.group.title)` puis `openGroup(info.syncId, info.group)`
     - `mergeChoiceKeepLocal` → `adoptLocalOverSynced(info.syncId, target)`
     - `mergeChoiceKeepCloud` → `adoptSyncedOverLocal(info.syncId, target, info.group)`
     - `mergeChoiceMerge` → `mergeLocalAndSynced(info.syncId, target, info.group)`
     - `buttonCancel` → `onCancel()` (referme, aucune action)
   - chaque handler `.then(scheduleRender)`.
3. État de dépliage : variable dans le closure de `renderClosedSection` (ex.
   `expandedFor: string | null` sur `info.syncId`), reconstruit au rerender.
4. Style : réutiliser les classes existantes du popup ; ajouter au besoin une classe
   `conflict-choice` dans `public/popup/popup.css`.
5. Tests : si le popup a des tests DOM (vérifier `tests/`), couvrir « pas de conflit →
   openGroup », « conflit unique → étape 2 directe », « conflits multiples → étape 1
   puis étape 2 », chaque bouton appelle la bonne primitive. Sinon, factoriser la
   logique de sélection d'action dans une fonction testable de `src/popup/` et la
   tester.

## Dépendances

[x1-detect-local-name-conflicts.md](x1-detect-local-name-conflicts.md)
[x3-reconciliation-primitives.md](x3-reconciliation-primitives.md)
[x4-i18n-merge-keys.md](x4-i18n-merge-keys.md)
