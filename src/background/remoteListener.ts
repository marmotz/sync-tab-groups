import browser from 'webextension-polyfill';
import { getDeviceId } from '../lib/deviceId';
import { devLog } from '../lib/devLog';
import { isLoggingEnabled } from '../lib/devMode';
import { getLocalGroupIdForSyncId, removeMappingBySyncId } from '../lib/localGroupMap';
import { isSyncedGroupKey, summarizeGroup, syncedGroupIdFromKey, type SyncedGroup } from '../lib/model';
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

  devLog(`storage.sync changé : ${key}`, {
    syncId,
    kind: oldValue === undefined ? 'added' : newValue === undefined ? 'removed' : 'modified',
    old: oldValue && summarizeGroup(oldValue),
    new: newValue && summarizeGroup(newValue),
    localGroupId: localGroupId ?? 'aucun mapping (groupe non partagé/ouvert ici)',
  });

  if (newValue === undefined) {
    devLog(`Groupe "${oldValue?.title ?? syncId}" supprimé partout ← reçu`);

    if (localGroupId === undefined) {
      devLog(`Suppression reçue pour ${syncId} : aucun mapping local, rien à faire`);
      return;
    }

    // Deleted everywhere: unshare locally but keep the tabs open as a plain local group.
    await removeMappingBySyncId(syncId);
    await clearSnapshot(syncId);
    return;
  }

  const deviceId = await getDeviceId();
  if (newValue.updatedBy === deviceId) {
    devLog(`Écho ignoré : "${newValue.title}" vient de notre propre écriture`, {
      deviceId,
      updatedBy: newValue.updatedBy,
    });
    return;
  }

  if (oldValue === undefined) {
    devLog(`Nouveau groupe "${newValue.title}" reçu ← disponible dans le popup`);
  }

  if (localGroupId === undefined) {
    devLog(`Mise à jour reçue pour "${newValue.title}" mais aucun mapping local : ignorée (groupe fermé/non lié ici)`, {
      syncId,
    });
    return;
  }

  const devMode = await isLoggingEnabled();
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
  devLog(`Mise à jour reçue appliquée sur le groupe local ${localGroupId}`, { syncId });
}

export function registerRemoteListener(): void {
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') {
      return;
    }

    devLog('storage.onChanged (sync)', { keys: Object.keys(changes) });

    for (const [key, change] of Object.entries(changes)) {
      void handleChange(
        key,
        change.oldValue as SyncedGroup | undefined,
        change.newValue as SyncedGroup | undefined,
      );
    }
  });
}
