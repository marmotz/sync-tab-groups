import browser from 'webextension-polyfill';
import type { TabGroups } from 'webextension-polyfill';
import { getDeviceId } from './deviceId';
import { devLog } from './devLog';
import {
  getAllMappedLocalGroupIds,
  getLocalGroupIdForSyncId,
  removeMappingByLocalGroupId,
  setMapping,
} from './localGroupMap';
import { markIntentionalClose } from './intentionalClose';
import { readLocalGroupState } from './localState';
import type { SyncedGroup } from './model';
import { applyRemoteGroup, closeLocalGroup, computeMergeAdditions, localGroupExists } from './reconciler';
import { t } from './i18n';
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

/**
 * Approximates each local group's on-screen position: the browser exposes no explicit
 * order for tabGroups.query, so we derive it from the index of its earliest tab within
 * its window (tabs are returned in strip order).
 */
async function getLocalGroupOrder(): Promise<Map<number, number>> {
  const tabs = await browser.tabs.query({});
  const order = new Map<number, number>();

  for (const tab of tabs) {
    if (tab.groupId === undefined || tab.groupId === -1 || tab.windowId === undefined) {
      continue;
    }
    const key = tab.windowId * 1_000_000 + tab.index;
    const existing = order.get(tab.groupId);
    if (existing === undefined || key < existing) {
      order.set(tab.groupId, key);
    }
  }

  return order;
}

export async function listUnsharedLocalGroups(): Promise<LocalGroupInfo[]> {
  const [allGroups, mappedIds, order] = await Promise.all([
    browser.tabGroups.query({}),
    getAllMappedLocalGroupIds(),
    getLocalGroupOrder(),
  ]);
  const unshared = allGroups.filter((group) => !mappedIds.has(group.id));

  const infos = await Promise.all(
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

  infos.sort((a, b) => (order.get(a.localGroupId) ?? 0) - (order.get(b.localGroupId) ?? 0));

  return infos;
}

/**
 * Canonical form for comparing group titles: case- and surrounding-whitespace-insensitive.
 * Deliberately does not touch accents or inner spacing (fuzzy matching is out of scope).
 */
export function normalizeGroupTitle(title: string): string {
  return title.trim().toLowerCase();
}

/**
 * Local groups (not yet synced) whose title collides with `title` once normalized,
 * in the same display order as `listUnsharedLocalGroups`.
 */
export async function findLocalNameConflicts(title: string): Promise<LocalGroupInfo[]> {
  const target = normalizeGroupTitle(title);
  const locals = await listUnsharedLocalGroups();
  return locals.filter((info) => normalizeGroupTitle(info.title) === target);
}

/**
 * Resolves the local mapping for a syncId and confirms the tabGroup it points to
 * still actually exists in the browser. A mapping can go stale (browser crash, forced
 * quit, service worker suspended mid-event) and be left pointing at a tabGroup that's
 * gone, which would otherwise show the group as permanently "open" and stuck. Cleans
 * up the orphaned mapping on detection so the popup self-heals on next render.
 */
async function resolveLocalGroupId(syncId: string): Promise<number | undefined> {
  const localGroupId = await getLocalGroupIdForSyncId(syncId);
  if (localGroupId === undefined) {
    return undefined;
  }
  if (await localGroupExists(localGroupId)) {
    return localGroupId;
  }
  devLog(`Mapping obsolète supprimé : le groupe local ${localGroupId} n'existe plus`, { syncId });
  await removeMappingByLocalGroupId(localGroupId);
  return undefined;
}

export async function listSyncedGroups(): Promise<SyncedGroupInfo[]> {
  const [allSynced, order] = await Promise.all([getAllSyncedGroups(), getLocalGroupOrder()]);
  const infos: SyncedGroupInfo[] = [];

  for (const [syncId, group] of allSynced) {
    const localGroupId = await resolveLocalGroupId(syncId);
    infos.push({ syncId, group, localGroupId });
  }

  devLog('Popup : groupes synchronisés lus depuis storage.sync', {
    groups: infos.map((info) => ({
      syncId: info.syncId,
      title: info.group.title,
      tabCount: info.group.tabs.length,
      updatedBy: info.group.updatedBy,
      localGroupId: info.localGroupId ?? 'fermé ici',
    })),
  });

  infos.sort((a, b) => {
    if (a.localGroupId !== undefined && b.localGroupId !== undefined) {
      return (order.get(a.localGroupId) ?? 0) - (order.get(b.localGroupId) ?? 0);
    }
    if (a.localGroupId === undefined && b.localGroupId === undefined) {
      return a.group.title.localeCompare(b.group.title);
    }
    return a.localGroupId !== undefined ? -1 : 1;
  });

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

/**
 * Shared closing step for every "same-name" reconciliation primitive: re-reads the local
 * group state *after* its tabs were mutated, then links it to the existing syncId and
 * pushes that final state to both the cloud and the local snapshot.
 */
async function linkAndPush(syncId: string, localGroupId: number): Promise<SyncedGroup> {
  const deviceId = await getDeviceId();
  const state = await readLocalGroupState(localGroupId, syncId, deviceId);

  await setMapping(localGroupId, syncId);
  await setSyncedGroup(state);
  await setSnapshot(syncId, state);

  return state;
}

/**
 * "Keep my local tabs": the local group already holds the wanted state, just adopt it under
 * the existing syncId and push it up.
 */
export async function adoptLocalOverSynced(syncId: string, localGroupId: number): Promise<void> {
  const state = await linkAndPush(syncId, localGroupId);
  devLog(`Groupe "${state.title}" : onglets locaux conservés → cloud`);
}

/**
 * "Keep the cloud tabs": align the local group on the remote content (may close local
 * tabs), then link and push.
 */
export async function adoptSyncedOverLocal(
  syncId: string,
  localGroupId: number,
  group: SyncedGroup,
): Promise<void> {
  await applyRemoteGroup(localGroupId, group);
  const state = await linkAndPush(syncId, localGroupId);
  devLog(`Groupe "${state.title}" : onglets du cloud conservés → local`);
}

/**
 * "Merge": append every remote tab not already open locally to the end of the local
 * group (local tabs first, then remote), then link and push.
 */
export async function mergeLocalAndSynced(
  syncId: string,
  localGroupId: number,
  group: SyncedGroup,
): Promise<void> {
  const tabGroup = await browser.tabGroups.get(localGroupId);
  const localTabs = await browser.tabs.query({ groupId: localGroupId });
  const localUrls = localTabs.map((tab) => tab.url ?? '');

  const additions = computeMergeAdditions(localUrls, group.tabs);
  const createdIds: number[] = [];
  for (const tab of additions) {
    const created = await browser.tabs.create({ url: tab.url, windowId: tabGroup.windowId, active: false });
    if (created.id !== undefined) {
      createdIds.push(created.id);
    }
  }
  if (createdIds.length > 0) {
    await browser.tabs.group({ tabIds: createdIds, groupId: localGroupId });
  }

  const state = await linkAndPush(syncId, localGroupId);
  devLog(`Groupe "${state.title}" : ${additions.length} onglet(s) distant(s) ajouté(s) → fusion`);
}

/**
 * Renames a local group so it no longer collides with `baseTitle`: picks the first free
 * title among "<base> (local)", "<base> (local 2)", … that clashes (normalized) with no
 * browser tab group and no synced group.
 */
export async function renameLocalGroupToAvoidConflict(localGroupId: number, baseTitle: string): Promise<void> {
  const suffix = t('localGroupSuffix');
  const [allGroups, allSynced] = await Promise.all([browser.tabGroups.query({}), getAllSyncedGroups()]);

  const taken = new Set<string>();
  for (const group of allGroups) {
    if (group.id !== localGroupId) {
      taken.add(normalizeGroupTitle(group.title ?? ''));
    }
  }
  for (const [, group] of allSynced) {
    taken.add(normalizeGroupTitle(group.title));
  }

  let candidate = `${baseTitle} (${suffix})`;
  let counter = 2;
  while (taken.has(normalizeGroupTitle(candidate))) {
    candidate = `${baseTitle} (${suffix} ${counter})`;
    counter += 1;
  }

  await browser.tabGroups.update(localGroupId, { title: candidate });
  devLog(`Groupe local renommé en "${candidate}" pour éviter la collision`);
}

export async function closeGroup(localGroupId: number): Promise<void> {
  if (!(await localGroupExists(localGroupId))) {
    // Mapping was already stale (tabGroups.onRemoved missed it): nothing to close,
    // just drop the orphaned mapping so the group stops appearing stuck as "open".
    await removeMappingByLocalGroupId(localGroupId);
    return;
  }
  // Marks this as a deliberate whole-group close so the background tabGroups.onRemoved
  // listener keeps the synced data (reopenable later) instead of treating it as the
  // group having emptied out tab-by-tab, which deletes it from the sync.
  await markIntentionalClose(localGroupId);
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
  devLog('Synchronisation forcée : lecture de storage.sync', { syncedCount: allSynced.size });

  for (const [syncId, group] of allSynced) {
    const localGroupId = await resolveLocalGroupId(syncId);
    if (localGroupId === undefined) {
      devLog(`Synchronisation forcée : "${group.title}" non ouvert ici, ignoré`, { syncId });
      continue;
    }

    await applyRemoteGroup(localGroupId, group);
    await setSnapshot(syncId, group);
  }

  devLog('Synchronisation forcée exécutée');
}
