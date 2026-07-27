import browser from 'webextension-polyfill';
import { groupContentEqual, type SyncedGroup } from './model';

const SNAPSHOT_KEY = 'groupSnapshots';

type RawSnapshots = Record<string, SyncedGroup>;

async function readSnapshots(): Promise<RawSnapshots> {
  const stored = await browser.storage.local.get(SNAPSHOT_KEY);
  return (stored[SNAPSHOT_KEY] as RawSnapshots | undefined) ?? {};
}

async function writeSnapshots(snapshots: RawSnapshots): Promise<void> {
  await browser.storage.local.set({ [SNAPSHOT_KEY]: snapshots });
}

export async function getSnapshot(syncId: string): Promise<SyncedGroup | undefined> {
  const snapshots = await readSnapshots();
  return snapshots[syncId];
}

export async function setSnapshot(syncId: string, group: SyncedGroup): Promise<void> {
  const snapshots = await readSnapshots();
  snapshots[syncId] = group;
  await writeSnapshots(snapshots);
}

export async function clearSnapshot(syncId: string): Promise<void> {
  const snapshots = await readSnapshots();
  delete snapshots[syncId];
  await writeSnapshots(snapshots);
}

export async function hasChangedSinceSnapshot(syncId: string, current: SyncedGroup): Promise<boolean> {
  const previous = await getSnapshot(syncId);
  if (previous === undefined) {
    return true;
  }
  return !groupContentEqual(previous, current);
}
