import browser from 'webextension-polyfill';
import { installTitleOverride } from './titleOverride';

const CUSTOM_TITLE_KEY = 'customTitle';

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
