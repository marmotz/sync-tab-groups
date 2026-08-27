# lib — fonction pure computeMergeAdditions

**Réf. tâche** : x2
**Statut** : fait
**Type** : lib
**Issue** :

Référence : [../features/merge-tab-groups-same-name/technical.md §3](../features/merge-tab-groups-same-name/technical.md#3-fusion--nouvelle-fonction-pure-dans-srclibreconcilerts).

## Constat vérifié

- `computeReconcileActions` ([src/lib/reconciler.ts:19](../../src/lib/reconciler.ts))
  supprime les onglets locaux non présents à distance → inadapté à la fusion.
- `SyncedTab` = `{ url, title, index }` ([src/lib/model.ts:1](../../src/lib/model.ts)).

## À faire

1. Ajouter dans `src/lib/reconciler.ts` :
   `computeMergeAdditions(localUrls: string[], remoteTabs: SyncedTab[]): SyncedTab[]`
   — renvoie les `remoteTabs` dont l'`url` n'est pas dans `localUrls` (égalité exacte,
   `Set`), ordre relatif distant conservé.
2. Tests dans `tests/lib/reconciler.test.ts` : aucun ajout si tout le distant est déjà
   local, tous ajoutés si aucun recouvrement, dédup sur URL exacte, ordre distant
   préservé, `localUrls` avec doublons géré.

## Dépendances

Aucune.
