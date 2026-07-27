import browser from 'webextension-polyfill';
import type { SyncedGroup, SyncedTab } from './model';

export async function readLocalGroupState(
  localGroupId: number,
  syncId: string,
  deviceId: string,
): Promise<SyncedGroup> {
  const tabGroup = await browser.tabGroups.get(localGroupId);
  const tabs = await browser.tabs.query({ groupId: localGroupId });

  const sortedTabs = [...tabs].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const syncedTabs: SyncedTab[] = sortedTabs.map((tab, i) => ({
    url: tab.url ?? '',
    title: tab.title ?? '',
    index: i,
  }));

  return {
    id: syncId,
    title: tabGroup.title ?? '',
    color: tabGroup.color,
    collapsed: tabGroup.collapsed,
    tabs: syncedTabs,
    updatedAt: Date.now(),
    updatedBy: deviceId,
  };
}
