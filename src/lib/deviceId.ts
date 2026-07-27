import browser from 'webextension-polyfill';

const DEVICE_ID_KEY = 'deviceId';

let cachedDeviceId: string | undefined;

export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId !== undefined) {
    return cachedDeviceId;
  }

  const stored = await browser.storage.local.get(DEVICE_ID_KEY);
  const existing = stored[DEVICE_ID_KEY];
  if (typeof existing === 'string') {
    cachedDeviceId = existing;
    return existing;
  }

  const generated = crypto.randomUUID();
  await browser.storage.local.set({ [DEVICE_ID_KEY]: generated });
  cachedDeviceId = generated;
  return generated;
}
