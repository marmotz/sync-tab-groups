import browser from 'webextension-polyfill';
import { relinkRestoredGroups } from '../lib/relink';
import { registerLocalListeners, runSyncLocalGroup } from './localListeners';
import { registerRemoteListener } from './remoteListener';
import { registerTabRenameMenu } from './tabRenameMenu';

registerLocalListeners();
registerRemoteListener();
registerTabRenameMenu();

// Tab group ids do not survive a browser restart: rebuild the local mapping from content.
browser.runtime.onStartup.addListener(() => {
  void relinkRestoredGroups().then((groupIds) => Promise.all(groupIds.map(runSyncLocalGroup)));
});
