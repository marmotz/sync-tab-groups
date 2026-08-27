# lib — détection des groupes locaux homonymes

**Réf. tâche** : x1
**Statut** : fait
**Type** : lib
**Issue** :

Référence : [../features/merge-tab-groups-same-name/technical.md §1](../features/merge-tab-groups-same-name/technical.md#1-détection-de-lhomonyme--couche-lib).

## Constat vérifié

- `listUnsharedLocalGroups()` ([src/lib/groupActions.ts:54](../../src/lib/groupActions.ts))
  renvoie déjà `{ localGroupId, title, color, tabCount }` triés dans l'ordre d'affichage.
- Aucune normalisation de titre n'existe aujourd'hui dans `src/lib`.

## À faire

1. Ajouter `normalizeGroupTitle(title: string): string` (`title.trim().toLowerCase()`)
   dans `src/lib/groupActions.ts` (exporté).
2. Ajouter `findLocalNameConflicts(title: string): Promise<LocalGroupInfo[]>` :
   `listUnsharedLocalGroups()` filtré par
   `normalizeGroupTitle(info.title) === normalizeGroupTitle(title)`, ordre préservé.
3. Tests dans `tests/lib/groupActions.test.ts` : match insensible à la casse et aux
   espaces, exclusion des groupes déjà mappés (déjà exclus par `listUnsharedLocalGroups`),
   liste vide si aucun homonyme, plusieurs homonymes renvoyés dans l'ordre.

## Dépendances

Aucune.
