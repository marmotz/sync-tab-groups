import browser from 'webextension-polyfill';

let cachedIsDev: boolean | undefined;

export async function isDevMode(): Promise<boolean> {
  if (cachedIsDev !== undefined) {
    return cachedIsDev;
  }

  const info = await browser.management.getSelf();
  cachedIsDev = info.installType === 'development';
  return cachedIsDev;
}
