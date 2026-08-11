import browser from 'webextension-polyfill';
import type { Runtime, Tabs } from 'webextension-polyfill';
import { t } from '../lib/i18n';
import { GET_CUSTOM_TITLE_MESSAGE } from '../lib/messages';
import { applyCustomTitle, clearCustomTitle, getCustomTitle, setCustomTitle } from '../lib/tabTitle';

const RENAME_MENU_ID = 'renameTab';
const RESET_MENU_ID = 'resetTabTitle';

async function promptForNewTitle(tab: Tabs.Tab): Promise<string | null> {
  if (tab.id === undefined) {
    return null;
  }

  try {
    const results = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: (promptLabel: string, current: string) => window.prompt(promptLabel, current),
      args: [t('renameTabPrompt'), tab.title ?? ''],
    });
    const value = results[0]?.result;
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

async function handleRename(tab: Tabs.Tab): Promise<void> {
  if (tab.id === undefined) {
    return;
  }

  const newTitle = await promptForNewTitle(tab);
  if (newTitle === null || newTitle.trim() === '') {
    return;
  }

  const trimmed = newTitle.trim();
  await setCustomTitle(tab.id, trimmed);
  await applyCustomTitle(tab.id, trimmed);
}

async function handleReset(tab: Tabs.Tab): Promise<void> {
  if (tab.id === undefined) {
    return;
  }

  await clearCustomTitle(tab.id);
  // The real title was overwritten in the page's DOM and cannot be recovered without
  // asking the page to render itself again.
  await browser.tabs.reload(tab.id);
}

async function updateResetVisibility(tabId: number): Promise<void> {
  const custom = await getCustomTitle(tabId);
  await browser.contextMenus.update(RESET_MENU_ID, { visible: custom !== undefined });
  await browser.contextMenus.refresh();
}

// Covers background script restarts (event page/service worker reload): tabs that are
// already loaded won't run the content script again on their own, so it has to be pushed
// to them once here. Fresh navigations afterwards are handled by the content script
// asking via GET_CUSTOM_TITLE_MESSAGE instead.
async function reapplyAllOpenTabs(): Promise<void> {
  const tabs = await browser.tabs.query({});
  for (const tab of tabs) {
    if (tab.id === undefined) {
      continue;
    }
    const custom = await getCustomTitle(tab.id);
    if (custom !== undefined) {
      await applyCustomTitle(tab.id, custom);
    }
  }
}

export function registerTabRenameMenu(): void {
  browser.contextMenus.create({
    id: RENAME_MENU_ID,
    title: t('renameTabTitle'),
    contexts: ['tab'],
  });
  browser.contextMenus.create({
    id: RESET_MENU_ID,
    title: t('resetTabTitleTitle'),
    contexts: ['tab'],
    visible: false,
  });

  browser.contextMenus.onShown.addListener((info, tab) => {
    if (!info.contexts.includes('tab') || tab.id === undefined) {
      return;
    }
    void updateResetVisibility(tab.id);
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (tab === undefined) {
      return;
    }
    if (info.menuItemId === RENAME_MENU_ID) {
      void handleRename(tab);
    } else if (info.menuItemId === RESET_MENU_ID) {
      void handleReset(tab);
    }
  });

  browser.runtime.onMessage.addListener((message: unknown, sender: Runtime.MessageSender) => {
    if (message !== GET_CUSTOM_TITLE_MESSAGE || sender.tab?.id === undefined) {
      return undefined;
    }
    return getCustomTitle(sender.tab.id);
  });

  void reapplyAllOpenTabs();
}
