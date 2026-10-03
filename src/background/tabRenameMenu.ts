import browser from 'webextension-polyfill';
import type { Runtime, Tabs } from 'webextension-polyfill';
import { GET_CUSTOM_TITLE_MESSAGE, TAB_CUSTOM_TITLE_CHANGED_MESSAGE } from '../lib/messages';
import { scheduleSyncForTabId } from './localListeners';
import { applyCustomTitle, clearCustomTitle, getCustomTitle, isTabRenamable } from '../lib/tabTitle';
import { t } from '../lib/i18n';

const RENAME_MENU_ID = 'renameTab';
const RESET_MENU_ID = 'resetTabTitle';

// browser.windows.create() without left/top defaults to the primary display, not the one
// the source window is on. On a multi-monitor setup this makes the popup appear on the
// "wrong" screen whenever the browser itself is on a secondary one. Centering it over the
// source window's own bounds keeps it on the same display.
async function computePopupPosition(
  windowId: number | undefined,
  width: number,
  height: number,
): Promise<{ left: number; top: number } | Record<string, never>> {
  if (windowId === undefined) {
    return {};
  }

  const sourceWindow = await browser.windows.get(windowId);
  if (
    sourceWindow.left === undefined ||
    sourceWindow.top === undefined ||
    sourceWindow.width === undefined ||
    sourceWindow.height === undefined
  ) {
    return {};
  }

  return {
    left: Math.round(sourceWindow.left + (sourceWindow.width - width) / 2),
    top: Math.round(sourceWindow.top + (sourceWindow.height - height) / 2),
  };
}

// A window.prompt() injected into the clicked tab's page renders on *that* tab, invisible
// if it isn't the active one. A dedicated extension window sidesteps this entirely: it's
// its own top-level window, shown regardless of which tab/window currently has focus, and
// works without ever needing to activate the target tab.
async function handleRename(tab: Tabs.Tab): Promise<void> {
  if (tab.id === undefined) {
    return;
  }

  const url = browser.runtime.getURL(
    `renameTab/index.html?tabId=${tab.id}&title=${encodeURIComponent(tab.title ?? '')}`,
  );
  const width = 420;
  const height = 160;
  const position = await computePopupPosition(tab.windowId, width, height);
  await browser.windows.create({ url, type: 'popup', width, height, ...position });
}

async function handleReset(tab: Tabs.Tab): Promise<void> {
  if (tab.id === undefined) {
    return;
  }

  await clearCustomTitle(tab.id);
  // The real title was overwritten in the page's DOM and cannot be recovered without
  // asking the page to render itself again.
  await browser.tabs.reload(tab.id);
  await scheduleSyncForTabId(tab.id);
}

async function updateMenuVisibility(tab: Tabs.Tab): Promise<void> {
  if (tab.id === undefined) {
    return;
  }

  const renamable = await isTabRenamable(tab);
  const custom = renamable ? await getCustomTitle(tab.id) : undefined;
  await browser.contextMenus.update(RENAME_MENU_ID, { visible: renamable });
  await browser.contextMenus.update(RESET_MENU_ID, { visible: renamable && custom !== undefined });
  await browser.contextMenus.refresh();
}

// Covers background script restarts (event page/service worker reload): tabs that are
// already loaded won't run the content script again on their own, so it has to be pushed
// to them once here. Fresh navigations afterwards are handled by the content script
// asking via GET_CUSTOM_TITLE_MESSAGE instead. Discarded tabs are skipped: they have no
// live document to inject into yet, and will pick up their title through the content
// script once actually loaded.
async function reapplyAllOpenTabs(): Promise<void> {
  const tabs = await browser.tabs.query({});
  for (const tab of tabs) {
    if (tab.id === undefined || tab.discarded === true) {
      continue;
    }
    const custom = await getCustomTitle(tab.id);
    if (custom !== undefined) {
      await applyCustomTitle(tab.id, custom);
    }
  }
}

function isTabCustomTitleChangedMessage(message: unknown): message is { type: string; tabId: number } {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === TAB_CUSTOM_TITLE_CHANGED_MESSAGE &&
    typeof (message as { tabId?: unknown }).tabId === 'number'
  );
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
    if (!info.contexts.includes('tab')) {
      return;
    }
    void updateMenuVisibility(tab);
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
    if (isTabCustomTitleChangedMessage(message)) {
      return scheduleSyncForTabId(message.tabId);
    }

    if (message !== GET_CUSTOM_TITLE_MESSAGE || sender.tab?.id === undefined) {
      return undefined;
    }

    return getCustomTitle(sender.tab.id);
  });

  void reapplyAllOpenTabs();
}
