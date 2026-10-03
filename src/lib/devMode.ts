import browser from 'webextension-polyfill';

const DEBUG_MODE_KEY = 'debugMode';

let cachedIsDev: boolean | undefined;

export async function isDevMode(): Promise<boolean> {
  if (cachedIsDev !== undefined) {
    return cachedIsDev;
  }

  const info = await browser.management.getSelf();
  cachedIsDev = info.installType === 'development';
  return cachedIsDev;
}

/** User-toggled debug flag (triple click on the popup logo), persisted per device. */
export async function isDebugMode(): Promise<boolean> {
  const stored = await browser.storage.local.get(DEBUG_MODE_KEY);
  return stored[DEBUG_MODE_KEY] === true;
}

export async function setDebugMode(enabled: boolean): Promise<void> {
  await browser.storage.local.set({ [DEBUG_MODE_KEY]: enabled });
}

/** Verbose logging is on for development installs and whenever the debug flag is set. */
export async function isLoggingEnabled(): Promise<boolean> {
  return (await isDevMode()) || (await isDebugMode());
}
