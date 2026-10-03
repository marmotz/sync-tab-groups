import browser from 'webextension-polyfill';

const MAP_KEY = 'localGroupMap';

type RawMap = Record<string, string>;

async function readMap(): Promise<RawMap> {
  const stored = await browser.storage.local.get(MAP_KEY);
  return (stored[MAP_KEY] as RawMap | undefined) ?? {};
}

async function writeMap(map: RawMap): Promise<void> {
  await browser.storage.local.set({ [MAP_KEY]: map });
}

export async function getSyncIdForLocalGroup(localGroupId: number): Promise<string | undefined> {
  const map = await readMap();
  return map[String(localGroupId)];
}

export async function getLocalGroupIdForSyncId(syncId: string): Promise<number | undefined> {
  const map = await readMap();
  for (const [localId, mappedSyncId] of Object.entries(map)) {
    if (mappedSyncId === syncId) {
      return Number(localId);
    }
  }
  return undefined;
}

export async function setMapping(localGroupId: number, syncId: string): Promise<void> {
  const map = await readMap();
  map[String(localGroupId)] = syncId;
  await writeMap(map);
}

export async function removeMappingByLocalGroupId(localGroupId: number): Promise<void> {
  const map = await readMap();
  delete map[String(localGroupId)];
  await writeMap(map);
}

export async function removeMappingBySyncId(syncId: string): Promise<void> {
  const map = await readMap();
  for (const [localId, mappedSyncId] of Object.entries(map)) {
    if (mappedSyncId === syncId) {
      delete map[localId];
    }
  }
  await writeMap(map);
}

export async function getAllMappedLocalGroupIds(): Promise<Set<number>> {
  const map = await readMap();

  return new Set(Object.keys(map).map(Number));
}

export async function getAllMappings(): Promise<Array<{ localGroupId: number; syncId: string }>> {
  const map = await readMap();

  return Object.entries(map).map(([localId, syncId]) => ({ localGroupId: Number(localId), syncId }));
}

export async function clearAllMappings(): Promise<void> {
  await writeMap({});
}
