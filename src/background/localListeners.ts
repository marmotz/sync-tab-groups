import browser from 'webextension-polyfill';
import type { Tabs } from 'webextension-polyfill';
import { getDeviceId } from '../lib/deviceId';
import { devLog } from '../lib/devLog';
import { getAllMappedLocalGroupIds, getSyncIdForLocalGroup, removeMappingByLocalGroupId } from '../lib/localGroupMap';
import { readLocalGroupState } from '../lib/localState';
import { diffTabUrls, groupContentEqual } from '../lib/model';
import { clearSnapshot, getSnapshot, setSnapshot } from '../lib/snapshot';
import { setSyncedGroup } from '../lib/syncStorage';
import { resolveTabGroupChange } from '../lib/tabGroupTracking';

const DEBOUNCE_MS = 500;
const pendingTimers = new Map<number, ReturnType<typeof setTimeout>>();

// The debounce above only coalesces *triggers* that arrive before it fires. Once fired,
// syncLocalGroup does several awaited reads/writes; if another trigger lands while that
// run is still in flight, a second overlapping run can finish *after* it and clobber its
// snapshot with stale data (a lost-update race). These two sets force runs for the same
// group to execute strictly one after another instead of overlapping.
const runningGroups = new Set<number>();
const rerunRequested = new Set<number>();

export async function runSyncLocalGroup(localGroupId: number): Promise<void> {
  if (runningGroups.has(localGroupId)) {
    rerunRequested.add(localGroupId);
    return;
  }

  runningGroups.add(localGroupId);
  try {
    await syncLocalGroup(localGroupId);
  } finally {
    runningGroups.delete(localGroupId);
    if (rerunRequested.delete(localGroupId)) {
      void runSyncLocalGroup(localGroupId);
    }
  }
}

function scheduleSync(localGroupId: number): void {
  const existing = pendingTimers.get(localGroupId);
  if (existing !== undefined) {
    clearTimeout(existing);
  }

  const timer = setTimeout(() => {
    pendingTimers.delete(localGroupId);
    void runSyncLocalGroup(localGroupId);
  }, DEBOUNCE_MS);
  pendingTimers.set(localGroupId, timer);
}

async function syncLocalGroup(localGroupId: number): Promise<void> {
  const syncId = await getSyncIdForLocalGroup(localGroupId);
  if (syncId === undefined) {
    return;
  }

  let currentState;
  try {
    currentState = await readLocalGroupState(localGroupId, syncId, await getDeviceId());
  } catch {
    return;
  }

  const previousSnapshot = await getSnapshot(syncId);
  if (previousSnapshot !== undefined && groupContentEqual(previousSnapshot, currentState)) {
    return;
  }

  if (previousSnapshot !== undefined) {
    const { added, removed } = diffTabUrls(previousSnapshot.tabs, currentState.tabs);
    for (const url of added) {
      devLog(`Nouvel onglet dans "${currentState.title}" → envoyé en sync`, { url });
    }
    for (const url of removed) {
      devLog(`Onglet fermé dans "${currentState.title}" → envoyé en sync`, { url });
    }
    if (added.length === 0 && removed.length === 0) {
      devLog(`Groupe "${currentState.title}" modifié (titre/couleur/collapsed) → envoyé en sync`);
    }
  }

  await setSyncedGroup(currentState);
  await setSnapshot(syncId, currentState);
}

async function handleGroupRemoved(localGroupId: number, title: string | undefined): Promise<void> {
  const timer = pendingTimers.get(localGroupId);
  if (timer !== undefined) {
    clearTimeout(timer);
    pendingTimers.delete(localGroupId);
  }

  const syncId = await getSyncIdForLocalGroup(localGroupId);
  if (syncId === undefined) {
    return;
  }

  devLog(`Groupe "${title ?? ''}" fermé sur ce device (reste synchronisé, réouvrable ailleurs)`);

  await removeMappingByLocalGroupId(localGroupId);
  await clearSnapshot(syncId);
}

async function resyncAllSharedGroups(): Promise<void> {
  const groupIds = await getAllMappedLocalGroupIds();
  for (const groupId of groupIds) {
    scheduleSync(groupId);
  }
}

// Tracks each tab's last known group so that when a tab leaves a group (dragged out,
// or closed) we can still resync the group it left, even though the tab's current
// state no longer references it.
const lastKnownGroupIdByTab = new Map<number, number>();

async function seedGroupIdTracking(): Promise<void> {
  const tabs = await browser.tabs.query({});
  for (const tab of tabs) {
    if (tab.id !== undefined && tab.groupId !== undefined && tab.groupId !== -1) {
      lastKnownGroupIdByTab.set(tab.id, tab.groupId);
    }
  }
}

function scheduleForTab(tab: Pick<Tabs.Tab, 'id' | 'groupId'>): void {
  const { joined, left } = resolveTabGroupChange(tab.id, tab.groupId, lastKnownGroupIdByTab);
  if (joined !== undefined) {
    scheduleSync(joined);
  }
  if (left !== undefined) {
    scheduleSync(left);
  }
}

export function registerLocalListeners(): void {
  void seedGroupIdTracking();

  browser.tabGroups.onCreated.addListener((group) => scheduleSync(group.id));
  browser.tabGroups.onUpdated.addListener((group) => scheduleSync(group.id));
  browser.tabGroups.onRemoved.addListener((group) => {
    void handleGroupRemoved(group.id, group.title);
  });

  browser.tabs.onCreated.addListener(scheduleForTab);
  browser.tabs.onUpdated.addListener((_tabId, _changeInfo, tab) => scheduleForTab(tab));
  browser.tabs.onMoved.addListener((tabId) => {
    void browser.tabs.get(tabId).then(scheduleForTab);
  });
  browser.tabs.onRemoved.addListener((tabId) => {
    const { left } = resolveTabGroupChange(tabId, undefined, lastKnownGroupIdByTab);

    if (left !== undefined) {
      scheduleSync(left);
    } else {
      // Tracking may not have caught this tab (e.g. the background script just
      // restarted): fall back to resyncing every shared group so nothing is missed.
      void resyncAllSharedGroups();
    }
  });
}
