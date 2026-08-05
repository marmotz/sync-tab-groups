import browser from 'webextension-polyfill';

const MARKERS_KEY = 'intentionalCloseMarkers';

async function readMarkers(): Promise<number[]> {
  const stored = await browser.storage.local.get(MARKERS_KEY);
  return (stored[MARKERS_KEY] as number[] | undefined) ?? [];
}

/**
 * closeGroup() and the tabGroups.onRemoved listener run in different extension
 * contexts (popup vs. background) and can't share in-memory state, so this marker
 * travels through storage.local: it's how the background listener tells apart an
 * explicit "Fermer" (keep the synced data, reopenable later) from a group that emptied
 * out one tab at a time (nothing meaningful left to keep synced).
 */
export async function markIntentionalClose(localGroupId: number): Promise<void> {
  const markers = await readMarkers();
  if (!markers.includes(localGroupId)) {
    await browser.storage.local.set({ [MARKERS_KEY]: [...markers, localGroupId] });
  }
}

export async function consumeIntentionalClose(localGroupId: number): Promise<boolean> {
  const markers = await readMarkers();
  if (!markers.includes(localGroupId)) {
    return false;
  }
  await browser.storage.local.set({ [MARKERS_KEY]: markers.filter((id) => id !== localGroupId) });
  return true;
}
