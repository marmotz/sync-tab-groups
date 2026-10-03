import browser from 'webextension-polyfill';
import { devLog } from './devLog';
import { getAllMappings, removeMappingByLocalGroupId, setMapping } from './localGroupMap';
import { normalizeGroupTitle } from './groupActions';
import { clearSnapshot } from './snapshot';
import { getAllSyncedGroups } from './syncStorage';

/**
 * Makes the persisted localGroupId -> syncId mapping consistent with the groups the browser
 * actually restored. Never destroys a mapping it cannot disprove:
 *  - the mapped id still exists with the same (normalized) title: the id survived the
 *    restart, the mapping and its snapshot are kept untouched;
 *  - otherwise the synced group is paired with the restored local group sharing its title,
 *    preferring the one with the most tabs in common, each local group being claimed at most
 *    once (the previous snapshot is dropped so the next sync pushes the real state);
 *  - the mapped id is absent from the browser (session restore may not have recreated the
 *    group yet): the mapping is kept as-is so a later run can still re-link it;
 *  - the mapped id now belongs to an unrelated group: the mapping is dropped, otherwise that
 *    group would be treated as shared and overwrite the synced one.
 * Idempotent: meant to be run again shortly after startup. Returns the re-linked local group
 * ids (new pairings only) so the caller can push their current state.
 */
export async function relinkRestoredGroups(): Promise<number[]> {
  const [previousMappings, allSynced, localGroups, allTabs] = await Promise.all([
    getAllMappings(),
    getAllSyncedGroups(),
    browser.tabGroups.query({}),
    browser.tabs.query({}),
  ]);

  devLog('Re-liaison : état avant', {
    previousMappings,
    syncedTitles: [...allSynced.values()].map((group) => ({ id: group.id, title: group.title })),
    localGroups: localGroups.map((group) => ({ id: group.id, title: group.title })),
  });

  const urlsByGroup = new Map<number, Set<string>>();
  for (const tab of allTabs) {
    if (tab.groupId === undefined || tab.groupId === -1) {
      continue;
    }
    const urls = urlsByGroup.get(tab.groupId) ?? new Set<string>();
    urls.add(tab.url ?? '');
    urlsByGroup.set(tab.groupId, urls);
  }

  const localById = new Map(localGroups.map((group) => [group.id, group]));
  const claimed = new Set<number>();
  const relinked: number[] = [];
  const toResolve: Array<{ localGroupId: number; syncId: string }> = [];

  // First pass: mappings that are still valid claim their local group before any title matching.
  for (const mapping of previousMappings) {
    const synced = allSynced.get(mapping.syncId);
    if (synced === undefined) {
      devLog('Re-liaison : groupe synchronisé introuvable, mapping abandonné', mapping);
      await removeMappingByLocalGroupId(mapping.localGroupId);
      await clearSnapshot(mapping.syncId);
      continue;
    }

    const local = localById.get(mapping.localGroupId);
    if (local !== undefined && normalizeGroupTitle(local.title ?? '') === normalizeGroupTitle(synced.title)) {
      claimed.add(local.id);
      devLog(`Re-liaison : mapping conservé pour "${synced.title}" (id local inchangé)`, mapping);
      continue;
    }

    toResolve.push(mapping);
  }

  for (const mapping of toResolve) {
    const synced = allSynced.get(mapping.syncId);
    if (synced === undefined) {
      continue;
    }

    const title = normalizeGroupTitle(synced.title);
    let best: { id: number; overlap: number } | undefined;
    for (const group of localGroups) {
      if (claimed.has(group.id) || normalizeGroupTitle(group.title ?? '') !== title) {
        continue;
      }

      const urls = urlsByGroup.get(group.id) ?? new Set<string>();
      const overlap = synced.tabs.filter((tab) => urls.has(tab.url)).length;
      if (best === undefined || overlap > best.overlap) {
        best = { id: group.id, overlap };
      }
    }

    if (best === undefined) {
      if (localById.has(mapping.localGroupId)) {
        devLog(`Re-liaison : id local réutilisé par un autre groupe, mapping de "${synced.title}" supprimé`, mapping);
        await removeMappingByLocalGroupId(mapping.localGroupId);
        await clearSnapshot(mapping.syncId);
      } else {
        devLog(`Re-liaison : groupe "${synced.title}" pas (encore) restauré, mapping conservé`, mapping);
      }
      continue;
    }

    claimed.add(best.id);
    await removeMappingByLocalGroupId(mapping.localGroupId);
    // The previous snapshot no longer reflects what is open: drop it so the next sync
    // pushes the restored group's actual state.
    await clearSnapshot(mapping.syncId);
    await setMapping(best.id, mapping.syncId);
    relinked.push(best.id);
    devLog(`Groupe "${synced.title}" restauré → re-lié après redémarrage`, {
      from: mapping.localGroupId,
      to: best.id,
    });
  }

  return relinked;
}
