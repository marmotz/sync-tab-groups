import browser from 'webextension-polyfill';
import type { SyncedGroup, SyncedTab } from './model';
import { getCustomTitle } from './tabTitle';

export async function readLocalGroupState(
  localGroupId: number,
  syncId: string,
  deviceId: string,
): Promise<SyncedGroup> {
  const tabGroup = await browser.tabGroups.get(localGroupId);
  const tabs = await browser.tabs.query({ groupId: localGroupId });

  const sortedTabs = [...tabs].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const syncedTabs: SyncedTab[] = await Promise.all(
    sortedTabs.map(async (tab, i) => {
      const syncedTab: SyncedTab = { url: tab.url ?? '', title: tab.title ?? '', index: i };
      const customTitle = tab.id === undefined ? undefined : await getCustomTitle(tab.id);

      if (customTitle !== undefined) {
        syncedTab.customTitle = customTitle;
      }

      return syncedTab;
    }),
  );

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
