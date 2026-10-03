export interface SyncedTab {
  url: string;
  title: string;
  index: number;
  customTitle?: string;
}

export interface SyncedGroup {
  id: string;
  title: string;
  color: string;
  collapsed: boolean;
  tabs: SyncedTab[];
  updatedAt: number;
  updatedBy: string;
}

export const SYNCED_GROUP_KEY_PREFIX = 'group:';

export function syncedGroupKey(id: string): string {
  return `${SYNCED_GROUP_KEY_PREFIX}${id}`;
}

export function isSyncedGroupKey(key: string): boolean {
  return key.startsWith(SYNCED_GROUP_KEY_PREFIX);
}

export function syncedGroupIdFromKey(key: string): string {
  return key.slice(SYNCED_GROUP_KEY_PREFIX.length);
}

export function tabsEqual(a: SyncedTab[], b: SyncedTab[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  return a.every((tabA, i) => {
    const tabB = b[i];
    return (
      tabB !== undefined &&
      tabA.url === tabB.url &&
      tabA.title === tabB.title &&
      tabA.index === tabB.index &&
      tabA.customTitle === tabB.customTitle
    );
  });
}

export interface TabUrlDiff {
  added: string[];
  removed: string[];
}

export function diffTabUrls(previous: SyncedTab[], current: SyncedTab[]): TabUrlDiff {
  const previousUrls = previous.map((tab) => tab.url);
  const currentUrls = current.map((tab) => tab.url);

  return {
    added: currentUrls.filter((url) => !previousUrls.includes(url)),
    removed: previousUrls.filter((url) => !currentUrls.includes(url)),
  };
}

export function groupContentEqual(a: SyncedGroup, b: SyncedGroup): boolean {
  return (
    a.title === b.title &&
    a.color === b.color &&
    a.collapsed === b.collapsed &&
    tabsEqual(a.tabs, b.tabs)
  );
}
