import browser from 'webextension-polyfill';
import type { TabGroups } from 'webextension-polyfill';
import type { SyncedGroup, SyncedTab } from './model';

export interface LocalTabRef {
  id: number;
  url: string;
}

export type ReconcileAction =
  | { type: 'removeTab'; tabId: number }
  | { type: 'createTab'; url: string; title: string; groupIndex: number }
  | { type: 'moveTab'; tabId: number; groupIndex: number };

/**
 * Pure diff: matches local tabs to remote tabs by URL (first unmatched match wins,
 * greedy in remote order), so duplicate URLs and reordering are handled deterministically.
 */
export function computeReconcileActions(localTabs: LocalTabRef[], remoteTabs: SyncedTab[]): ReconcileAction[] {
  const remaining = localTabs.map((tab) => ({ ...tab, matched: false }));
  const matchedByRemoteIndex = new Map<number, LocalTabRef>();

  remoteTabs.forEach((remoteTab, i) => {
    const match = remaining.find((tab) => !tab.matched && tab.url === remoteTab.url);
    if (match) {
      match.matched = true;
      matchedByRemoteIndex.set(i, match);
    }
  });

  const actions: ReconcileAction[] = [];

  for (const tab of remaining) {
    if (!tab.matched) {
      actions.push({ type: 'removeTab', tabId: tab.id });
    }
  }

  remoteTabs.forEach((remoteTab, i) => {
    const match = matchedByRemoteIndex.get(i);
    if (match) {
      actions.push({ type: 'moveTab', tabId: match.id, groupIndex: i });
    } else {
      actions.push({ type: 'createTab', url: remoteTab.url, title: remoteTab.title, groupIndex: i });
    }
  });

  return actions;
}

export async function applyRemoteGroup(
  localGroupId: number,
  remoteGroup: SyncedGroup,
  onAction?: (action: ReconcileAction) => void,
): Promise<void> {
  const tabGroup = await browser.tabGroups.get(localGroupId);
  const localTabs = await browser.tabs.query({ groupId: localGroupId });
  const sorted = [...localTabs].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const localRefs: LocalTabRef[] = sorted
    .filter((tab): tab is typeof tab & { id: number } => tab.id !== undefined)
    .map((tab) => ({ id: tab.id, url: tab.url ?? '' }));

  const actions = computeReconcileActions(localRefs, remoteGroup.tabs);
  actions.forEach((action) => onAction?.(action));

  for (const action of actions) {
    if (action.type === 'removeTab') {
      await browser.tabs.remove(action.tabId);
    }
  }

  const remainingTabs = await browser.tabs.query({ groupId: localGroupId });
  const baseIndex =
    remainingTabs.length > 0
      ? Math.min(...remainingTabs.map((tab) => tab.index ?? 0))
      : (await browser.tabs.query({ windowId: tabGroup.windowId })).length;

  for (const action of actions) {
    if (action.type === 'createTab') {
      const created = await browser.tabs.create({
        url: action.url,
        windowId: tabGroup.windowId,
        index: baseIndex + action.groupIndex,
        active: false,
      });
      if (created.id !== undefined) {
        await browser.tabs.group({ tabIds: created.id, groupId: localGroupId });
      }
    }
  }

  for (const action of actions) {
    if (action.type === 'moveTab') {
      await browser.tabs.move(action.tabId, { index: baseIndex + action.groupIndex });
    }
  }

  await browser.tabGroups.update(localGroupId, {
    title: remoteGroup.title,
    color: remoteGroup.color as TabGroups.Color,
    collapsed: remoteGroup.collapsed,
  });
}

export async function closeLocalGroup(localGroupId: number): Promise<void> {
  const tabs = await browser.tabs.query({ groupId: localGroupId });
  const ids = tabs.map((tab) => tab.id).filter((id): id is number => id !== undefined);
  if (ids.length > 0) {
    await browser.tabs.remove(ids);
  }
}
