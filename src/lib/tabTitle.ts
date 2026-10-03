import browser from 'webextension-polyfill';
import type { Tabs } from 'webextension-polyfill';
import { devLog } from './devLog';
import { installTitleOverride } from './titleOverride';

const CUSTOM_TITLE_KEY = 'customTitle';

const NON_SCRIPTABLE_URL_PREFIXES = ['about:', 'moz-extension:', 'chrome:', 'resource:', 'view-source:', 'data:'];

function isKnownNonScriptableUrl(url: string | undefined): boolean {
  if (url === undefined) {
    return true;
  }
  return NON_SCRIPTABLE_URL_PREFIXES.some((prefix) => url.startsWith(prefix));
}

export async function getCustomTitle(tabId: number): Promise<string | undefined> {
  const value = await browser.sessions.getTabValue(tabId, CUSTOM_TITLE_KEY);
  return typeof value === 'string' ? value : undefined;
}

export async function setCustomTitle(tabId: number, title: string): Promise<void> {
  await browser.sessions.setTabValue(tabId, CUSTOM_TITLE_KEY, title);
}

export async function clearCustomTitle(tabId: number): Promise<void> {
  await browser.sessions.removeTabValue(tabId, CUSTOM_TITLE_KEY);
}

// Not every tab is scriptable (privileged pages, the addons manager, the PDF viewer...):
// injection failures there are expected and safe to ignore.
export async function applyCustomTitle(tabId: number, title: string): Promise<void> {
  try {
    await browser.scripting.executeScript({
      target: { tabId },
      func: installTitleOverride,
      args: [title],
    });
  } catch {
    // ignored: not a scriptable tab
  }
}

// Probes whether a tab can actually be renamed (i.e. scripted) before offering the menu
// entry for it — no point letting the user pick "Rename" on a page where it can only
// fail silently (about:, the add-ons manager, the PDF viewer...).
export async function isTabRenamable(tab: Pick<Tabs.Tab, 'id' | 'url' | 'discarded'>): Promise<boolean> {
  if (tab.id === undefined) {
    return false;
  }

  // The URL check is authoritative and always runs first: some internal Firefox pages
  // (e.g. about:debugging) don't actually reject scripting.executeScript the way other
  // privileged pages do, so the probe below alone would wrongly call them renamable.
  if (isKnownNonScriptableUrl(tab.url)) {
    return false;
  }

  // A discarded (unloaded) tab — restored at browser startup but never clicked on since,
  // or unloaded by Firefox to save memory — has no live document to inject into: probing
  // it via scripting.executeScript always fails, even for an ordinary http(s) page. Once
  // it passed the URL check above, trust it and let the content script pick up the
  // stored custom title on its own once the user actually opens the tab.
  if (tab.discarded === true) {
    return true;
  }

  try {
    await browser.scripting.executeScript({ target: { tabId: tab.id }, func: () => true });
    return true;
  } catch (error) {
    devLog('Tab is not renamable (script injection refused)', { tabId: tab.id, error: String(error) });
    return false;
  }
}

// Aligns a local tab on the custom title received from another device. Nothing is done
// when it already matches. Clearing reloads the tab, as the real page title was
// overwritten in the DOM and can only be recovered by rendering the page again.
export async function applyRemoteCustomTitle(tabId: number, customTitle: string | undefined): Promise<void> {
  const current = await getCustomTitle(tabId);
  if (current === customTitle) {
    return;
  }

  if (customTitle === undefined) {
    await clearCustomTitle(tabId);
    await browser.tabs.reload(tabId);

    return;
  }

  await setCustomTitle(tabId, customTitle);
  await applyCustomTitle(tabId, customTitle);
}
