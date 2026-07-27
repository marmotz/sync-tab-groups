import browser from 'webextension-polyfill';
import { isSyncedGroupKey, syncedGroupIdFromKey, syncedGroupKey, type SyncedGroup } from './model';

export async function getAllSyncedGroups(): Promise<Map<string, SyncedGroup>> {
  const all = await browser.storage.sync.get(null);
  const groups = new Map<string, SyncedGroup>();

  for (const [key, value] of Object.entries(all)) {
    if (isSyncedGroupKey(key)) {
      groups.set(syncedGroupIdFromKey(key), value as SyncedGroup);
    }
  }

  return groups;
}

export async function getSyncedGroup(id: string): Promise<SyncedGroup | undefined> {
  const stored = await browser.storage.sync.get(syncedGroupKey(id));
  return stored[syncedGroupKey(id)] as SyncedGroup | undefined;
}

export async function setSyncedGroup(group: SyncedGroup): Promise<void> {
  await browser.storage.sync.set({ [syncedGroupKey(group.id)]: group });
}

export async function removeSyncedGroup(id: string): Promise<void> {
  await browser.storage.sync.remove(syncedGroupKey(id));
}
