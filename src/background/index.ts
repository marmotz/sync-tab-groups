import browser from 'webextension-polyfill';
import { devLog } from '../lib/devLog';
import { logSyncState } from '../lib/diagnostics';
import { relinkRestoredGroups } from '../lib/relink';
import { registerLocalListeners, runSyncLocalGroup } from './localListeners';
import { registerRemoteListener } from './remoteListener';
import { registerTabRenameMenu } from './tabRenameMenu';

registerLocalListeners();
registerRemoteListener();
registerTabRenameMenu();

devLog('Background script initialisé');
void logSyncState('init');

// Toggling debug mode from the popup dumps the current state in the background console.
browser.storage.onChanged.addListener((changes, areaName) => {
  const change = changes['debugMode'];
  if (areaName === 'local' && change?.newValue === true) {
    void logSyncState('debug activé');
  }
});

// Session restore may still be recreating tab groups when onStartup fires, so the re-link
// is repeated a few times (it is idempotent and never drops a mapping it cannot disprove).
const RELINK_DELAYS_MS = [0, 3000, 10000, 30000];

async function relinkAndPush(attempt: number): Promise<void> {
  const groupIds = await relinkRestoredGroups();
  await Promise.all(groupIds.map(runSyncLocalGroup));
  await logSyncState(`après re-liaison (essai ${attempt + 1})`);
}

browser.runtime.onStartup.addListener(() => {
  devLog('Démarrage du navigateur (onStartup) → re-liaison des groupes');
  void logSyncState('onStartup, avant re-liaison');

  RELINK_DELAYS_MS.forEach((delay, attempt) => {
    setTimeout(() => {
      void relinkAndPush(attempt).catch((error: unknown) => {
        devLog('Re-liaison en échec', { error: String(error) });
      });
    }, delay);
  });
});
