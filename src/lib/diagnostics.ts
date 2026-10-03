import browser from 'webextension-polyfill';
import { getDeviceId } from './deviceId';
import { devLog, readPersistedLog } from './devLog';
import { isLoggingEnabled } from './devMode';
import { getAllMappings } from './localGroupMap';
import { getCustomTitle } from './tabTitle';
import { summarizeGroup } from './model';
import type { SyncedGroup } from './model';
import { getAllSyncedGroups } from './syncStorage';

/**
 * Dumps everything the sync decisions depend on: device id, local group -> syncId mapping,
 * live browser tab groups and the content of storage.sync. No-op (and no storage reads)
 * unless logging is enabled.
 */
export async function logSyncState(reason: string): Promise<void> {
  if (!(await isLoggingEnabled())) {
    return;
  }

  try {
    const [deviceId, mappings, synced, localGroups, snapshots] = await Promise.all([
      getDeviceId(),
      getAllMappings(),
      getAllSyncedGroups(),
      browser.tabGroups.query({}),
      browser.storage.local.get('groupSnapshots'),
    ]);

    const liveLocalIds = new Set(localGroups.map((group) => group.id));
    const syncedGroups = [...synced.values()].map(summarizeGroup);

    devLog(`État de la synchro (${reason})`, {
      deviceId,
      mappings: mappings.map((mapping) => ({
        ...mapping,
        localGroupExists: liveLocalIds.has(mapping.localGroupId),
        syncedGroupExists: synced.has(mapping.syncId),
      })),
      localGroups: localGroups.map((group) => ({ id: group.id, title: group.title, windowId: group.windowId })),
      syncedGroups,
      snapshotSyncIds: Object.keys((snapshots.groupSnapshots as Record<string, unknown> | undefined) ?? {}),
    });
  } catch (error) {
    devLog(`Impossible de lire l'état de la synchro (${reason})`, { error: String(error) });
  }
}

async function safe<T>(read: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await read();
  } catch (error) {
    return { error: String(error) };
  }
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Firefox exposes no API to read the signed-in Firefox account to extensions. As a proxy,
 * fingerprint the content of storage.sync (group ids, timestamps, authors): once sync has
 * settled, two devices on the same account must show the same fingerprint.
 */
async function readSyncFingerprint(synced: Map<string, SyncedGroup>): Promise<Record<string, unknown>> {
  const lines = [...synced.values()]
    .map((group) => `${group.id}|${group.updatedAt}|${group.updatedBy}`)
    .sort();

  return {
    note: 'No API exposes the Firefox account: compare this fingerprint across devices (same account => same value once synced).',
    groupCount: lines.length,
    fingerprint: (await sha256Hex(lines.join('\n'))).slice(0, 16),
    syncBytesInUse: await safe(() => browser.storage.sync.getBytesInUse(null)),
  };
}

async function readRenamedTabs(
  mappings: Array<{ localGroupId: number; syncId: string }>,
): Promise<Array<Record<string, unknown>>> {
  const tabs = await browser.tabs.query({});
  const syncIdByLocalGroup = new Map(mappings.map((mapping) => [mapping.localGroupId, mapping.syncId]));
  const renamed: Array<Record<string, unknown>> = [];

  for (const tab of tabs) {
    if (tab.id === undefined) {
      continue;
    }
    const customTitle = await getCustomTitle(tab.id);
    if (customTitle === undefined) {
      continue;
    }
    renamed.push({
      tabId: tab.id,
      groupId: tab.groupId,
      syncId: syncIdByLocalGroup.get(tab.groupId ?? -1) ?? null,
      url: tab.url,
      pageTitle: tab.title,
      customTitle,
    });
  }

  return renamed;
}

/** Full snapshot of the current state for manual debugging (shown from the popup debug badge). */
export async function buildDebugDump(): Promise<Record<string, unknown>> {
  const [deviceId, mappings, synced, groups, tabs, snapshots] = await Promise.all([
    getDeviceId(),
    getAllMappings(),
    getAllSyncedGroups(),
    browser.tabGroups.query({}),
    browser.tabs.query({}),
    browser.storage.local.get('groupSnapshots'),
  ]);

  const localGroups = await Promise.all(
    groups.map(async (group) => {
      const groupTabs = tabs
        .filter((tab) => tab.groupId === group.id)
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

      return {
        id: group.id,
        title: group.title,
        color: group.color,
        collapsed: group.collapsed,
        windowId: group.windowId,
        syncId: mappings.find((mapping) => mapping.localGroupId === group.id)?.syncId ?? null,
        tabs: await Promise.all(
          groupTabs.map(async (tab) => ({
            id: tab.id,
            index: tab.index,
            url: tab.url,
            title: tab.title,
            discarded: tab.discarded,
            customTitle: tab.id === undefined ? undefined : await getCustomTitle(tab.id),
          })),
        ),
      };
    }),
  );

  return {
    generatedAt: new Date().toISOString(),
    extension: {
      id: browser.runtime.id,
      version: browser.runtime.getManifest().version,
      installType: await safe(async () => (await browser.management.getSelf()).installType),
      browser: await safe(() => browser.runtime.getBrowserInfo()),
      userAgent: navigator.userAgent,
    },
    deviceId,
    account: await safe(() => readSyncFingerprint(synced)),
    mappings,
    localGroups,
    syncedGroups: [...synced.values()],
    snapshots: snapshots.groupSnapshots ?? {},
    renamedTabs: await safe(() => readRenamedTabs(mappings)),
    log: await safe(readPersistedLog),
  };
}
