import browser from 'webextension-polyfill';
import { getDeviceId } from '../lib/deviceId';
import { devLog } from '../lib/devLog';
import { isDevMode } from '../lib/devMode';
import { getLocalGroupIdForSyncId, removeMappingBySyncId } from '../lib/localGroupMap';
import { isSyncedGroupKey, syncedGroupIdFromKey, type SyncedGroup } from '../lib/model';
import { applyRemoteGroup } from '../lib/reconciler';
import { clearSnapshot, setSnapshot } from '../lib/snapshot';

async function handleChange(
  key: string,
  oldValue: SyncedGroup | undefined,
  newValue: SyncedGroup | undefined,
): Promise<void> {
  if (!isSyncedGroupKey(key)) {
    return;
  }

  const syncId = syncedGroupIdFromKey(key);
  const localGroupId = await getLocalGroupIdForSyncId(syncId);

  if (newValue === undefined) {
    devLog(`Groupe "${oldValue?.title ?? syncId}" supprimé partout ← reçu`);

    if (localGroupId === undefined) {
      return;
    }

    // Deleted everywhere: unshare locally but keep the tabs open as a plain local group.
    await removeMappingBySyncId(syncId);
    await clearSnapshot(syncId);
    return;
  }

  const deviceId = await getDeviceId();
  if (newValue.updatedBy === deviceId) {
    devLog(`Écho ignoré : "${newValue.title}" vient de notre propre écriture`);
    return;
  }

  if (oldValue === undefined) {
    devLog(`Nouveau groupe "${newValue.title}" reçu ← disponible dans le popup`);
  }

  if (localGroupId === undefined) {
    return;
  }

  const devMode = await isDevMode();
  await applyRemoteGroup(
    localGroupId,
    newValue,
    devMode
      ? (action) => {
          if (action.type === 'createTab') {
            devLog(`Onglet reçu ← ajouté dans "${newValue.title}"`, { url: action.url });
          } else if (action.type === 'removeTab') {
            devLog(`Onglet reçu ← supprimé de "${newValue.title}"`, { tabId: action.tabId });
          }
        }
      : undefined,
  );
  await setSnapshot(syncId, newValue);
}

export function registerRemoteListener(): void {
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') {
      return;
    }

    for (const [key, change] of Object.entries(changes)) {
      void handleChange(
        key,
        change.oldValue as SyncedGroup | undefined,
        change.newValue as SyncedGroup | undefined,
      );
    }
  });
}
