import browser from 'webextension-polyfill';
import { devLog } from './devLog';
import { clearAllMappings, getAllMappings, setMapping } from './localGroupMap';
import { normalizeGroupTitle } from './groupActions';
import { clearSnapshot } from './snapshot';
import { getAllSyncedGroups } from './syncStorage';

/**
 * Tab group ids are only unique within a browser session: after a restart the restored
 * groups come back under new ids, so the persisted localGroupId -> syncId mapping is stale
 * (it either points nowhere, or at an unrelated group that reuses the id). Left alone, the
 * restored group shows up as a plain local group while its synced twin shows up as closed.
 *
 * Rebuilds the mapping from content: every previously mapped synced group is paired with
 * the restored local group sharing its (normalized) title, preferring the one with the most
 * tabs in common, each local group being claimed at most once. Returns the re-linked local
 * group ids so the caller can push their current state.
 */
export async function relinkRestoredGroups(): Promise<number[]> {
  const [previousMappings, allSynced, localGroups, allTabs] = await Promise.all([
    getAllMappings(),
    getAllSyncedGroups(),
    browser.tabGroups.query({}),
    browser.tabs.query({}),
  ]);

  await clearAllMappings();

  const urlsByGroup = new Map<number, Set<string>>();
  for (const tab of allTabs) {
    if (tab.groupId === undefined || tab.groupId === -1) {
      continue;
    }
    const urls = urlsByGroup.get(tab.groupId) ?? new Set<string>();
    urls.add(tab.url ?? '');
    urlsByGroup.set(tab.groupId, urls);
  }

  const claimed = new Set<number>();
  const relinked: number[] = [];

  for (const { syncId } of previousMappings) {
    const synced = allSynced.get(syncId);
    if (synced === undefined) {
      await clearSnapshot(syncId);

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

    // The previous snapshot no longer reflects what is open: drop it so the next sync
    // pushes the restored group's actual state.
    await clearSnapshot(syncId);
    if (best === undefined) {
      continue;
    }

    claimed.add(best.id);
    await setMapping(best.id, syncId);
    relinked.push(best.id);
    devLog(`Groupe "${synced.title}" restauré → re-lié après redémarrage`);
  }

  return relinked;
}
