# lib — primitives de réconciliation et renommage local

**Réf. tâche** : x3
**Statut** : fait
**Type** : lib
**Issue** :

Référence : [../features/merge-tab-groups-same-name/technical.md §2 et §4](../features/merge-tab-groups-same-name/technical.md#2-nouvelles-primitives-de-réconciliation--srclibgroupactionsts).

## Constat vérifié

- `shareGroup` ([src/lib/groupActions.ts:120](../../src/lib/groupActions.ts)) fait
  `readLocalGroupState(id, syncId, deviceId)` + `setSyncedGroup` + `setMapping` +
  `setSnapshot`, mais génère un `syncId` neuf.
- `readLocalGroupState(localGroupId, syncId, deviceId)`
  ([src/lib/localState.ts:4](../../src/lib/localState.ts)) accepte un `syncId` fourni.
- `applyRemoteGroup(localGroupId, remoteGroup)`
  ([src/lib/reconciler.ts:51](../../src/lib/reconciler.ts)) aligne le local sur le distant.
- `getAllSyncedGroups()` ([src/lib/syncStorage.ts:3](../../src/lib/syncStorage.ts)).

## À faire

Dans `src/lib/groupActions.ts`, avec `deviceId = await getDeviceId()` et un trio de
clôture commun `setMapping(localGroupId, syncId)` + `setSyncedGroup(state)` +
`setSnapshot(syncId, state)` où `state = await readLocalGroupState(localGroupId, syncId, deviceId)`
relu **après** mutation des onglets :

1. `adoptLocalOverSynced(syncId, localGroupId)` — pas de mutation, trio direct.
2. `adoptSyncedOverLocal(syncId, localGroupId, group)` — `applyRemoteGroup(localGroupId, group)` puis trio.
3. `mergeLocalAndSynced(syncId, localGroupId, group)` :
   - `localUrls` via `browser.tabs.query({ groupId: localGroupId })` ;
   - `computeMergeAdditions(localUrls, group.tabs)` ;
   - pour chaque addition : `browser.tabs.create({ url, windowId, active: false })`
     puis `browser.tabs.group({ tabIds, groupId: localGroupId })` (append) ;
   - trio.
4. `renameLocalGroupToAvoidConflict(localGroupId, baseTitle)` :
   - premier titre libre parmi `"<base> (local)"`, `"<base> (local 2)"`, … non en
     collision (`normalizeGroupTitle`) avec `browser.tabGroups.query({})` ni
     `getAllSyncedGroups()` ; le mot « local » vient de `t('localGroupSuffix')` ;
   - `browser.tabGroups.update(localGroupId, { title })`.

5. Tests dans `tests/lib/groupActions.test.ts` (mock `browserMock`) : chaque primitive
   écrit le mapping + le groupe sync + le snapshot ; `mergeLocalAndSynced` ne crée que
   les onglets distants absents ; `adoptSyncedOverLocal` délègue à `applyRemoteGroup` ;
   `renameLocalGroupToAvoidConflict` incrémente le suffixe tant qu'il y a collision
   (locale ou synchronisée).

## Dépendances

[x2-compute-merge-additions.md](x2-compute-merge-additions.md) — `computeMergeAdditions`.
[x1-detect-local-name-conflicts.md](x1-detect-local-name-conflicts.md) — `normalizeGroupTitle`.
[x4-i18n-merge-keys.md](x4-i18n-merge-keys.md) — clé `localGroupSuffix`.
