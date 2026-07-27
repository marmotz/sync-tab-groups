import browser from 'webextension-polyfill';
import type { TabGroups } from 'webextension-polyfill';
import { getDeviceId } from './deviceId';
import { devLog } from './devLog';
import { getAllMappedLocalGroupIds, getLocalGroupIdForSyncId, setMapping } from './localGroupMap';
import { readLocalGroupState } from './localState';
import type { SyncedGroup } from './model';
import { applyRemoteGroup, closeLocalGroup } from './reconciler';
import { setSnapshot } from './snapshot';
import { getAllSyncedGroups, removeSyncedGroup, setSyncedGroup } from './syncStorage';

export interface LocalGroupInfo {
  localGroupId: number;
  title: string;
  color: string;
  tabCount: number;
}

export interface SyncedGroupInfo {
  syncId: string;
  group: SyncedGroup;
  localGroupId?: number;
}

export async function listUnsharedLocalGroups(): Promise<LocalGroupInfo[]> {
  const [allGroups, mappedIds] = await Promise.all([browser.tabGroups.query({}), getAllMappedLocalGroupIds()]);
  const unshared = allGroups.filter((group) => !mappedIds.has(group.id));

  return Promise.all(
    unshared.map(async (group) => {
      const tabs = await browser.tabs.query({ groupId: group.id });
      return {
        localGroupId: group.id,
        title: group.title ?? '',
        color: group.color,
        tabCount: tabs.length,
      };
    }),
  );
}

export async function listSyncedGroups(): Promise<SyncedGroupInfo[]> {
  const allSynced = await getAllSyncedGroups();
  const infos: SyncedGroupInfo[] = [];

  for (const [syncId, group] of allSynced) {
    const localGroupId = await getLocalGroupIdForSyncId(syncId);
    infos.push({ syncId, group, localGroupId });
  }

  return infos;
}

export async function shareGroup(localGroupId: number): Promise<void> {
  const syncId = crypto.randomUUID();
  const deviceId = await getDeviceId();
  const state = await readLocalGroupState(localGroupId, syncId, deviceId);

  await setSyncedGroup(state);
  await setMapping(localGroupId, syncId);
  await setSnapshot(syncId, state);

  devLog(`Groupe "${state.title}" partagé → sync activée`);
}

export async function openGroup(syncId: string, group: SyncedGroup): Promise<void> {
  const currentWindow = await browser.windows.getCurrent();
  const createdIds: number[] = [];

  for (const tab of group.tabs) {
    const created = await browser.tabs.create({ url: tab.url, windowId: currentWindow.id, active: false });
    if (created.id !== undefined) {
      createdIds.push(created.id);
    }
  }

  if (createdIds.length === 0) {
    return;
  }

  const localGroupId = await browser.tabs.group({
    tabIds: createdIds,
    createProperties: { windowId: currentWindow.id },
  });
  await browser.tabGroups.update(localGroupId, {
    title: group.title,
    color: group.color as TabGroups.Color,
    collapsed: group.collapsed,
  });

  await setMapping(localGroupId, syncId);
  await setSnapshot(syncId, group);

  devLog(`Groupe "${group.title}" ouvert sur ce device`);
}

export async function closeGroup(localGroupId: number): Promise<void> {
  await closeLocalGroup(localGroupId);
}

export async function deleteGroupEverywhere(syncId: string, title: string): Promise<void> {
  devLog(`Groupe "${title}" supprimé de la sync → partout`);
  await removeSyncedGroup(syncId);
}

/**
 * Manual catch-up pull: re-applies the current state of every synced group that is open
 * here, regardless of storage.onChanged events. Needed because a suspended background
 * service worker can miss those events, leaving a device stuck until something else
 * triggers a write.
 */
export async function forceSyncNow(): Promise<void> {
  const allSynced = await getAllSyncedGroups();

  for (const [syncId, group] of allSynced) {
    const localGroupId = await getLocalGroupIdForSyncId(syncId);
    if (localGroupId === undefined) {
      continue;
    }

    await applyRemoteGroup(localGroupId, group);
    await setSnapshot(syncId, group);
  }

  devLog('Synchronisation forcée exécutée');
}
