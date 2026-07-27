import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browserMock } from '../setup';
import { getAllSyncedGroups, getSyncedGroup, removeSyncedGroup, setSyncedGroup } from '../../src/lib/syncStorage';
import type { SyncedGroup } from '../../src/lib/model';

function makeGroup(id: string): SyncedGroup {
  return {
    id,
    title: `Group ${id}`,
    color: 'blue',
    collapsed: false,
    tabs: [],
    updatedAt: 1,
    updatedBy: 'device-1',
  };
}

beforeEach(() => {
  browserMock.storage.sync.__reset();
  vi.clearAllMocks();
});

describe('syncStorage', () => {
  it('stores and reads back a group by id', async () => {
    const group = makeGroup('g1');
    await setSyncedGroup(group);
    expect(await getSyncedGroup('g1')).toEqual(group);
  });

  it('returns undefined for an unknown group id', async () => {
    expect(await getSyncedGroup('missing')).toBeUndefined();
  });

  it('removes a group', async () => {
    await setSyncedGroup(makeGroup('g1'));
    await removeSyncedGroup('g1');
    expect(await getSyncedGroup('g1')).toBeUndefined();
  });

  it('lists only synced-group entries, ignoring unrelated sync keys', async () => {
    await setSyncedGroup(makeGroup('g1'));
    await setSyncedGroup(makeGroup('g2'));
    await browserMock.storage.sync.set({ somethingElse: 'value' });

    const all = await getAllSyncedGroups();

    expect(all.size).toBe(2);
    expect(all.get('g1')?.title).toBe('Group g1');
    expect(all.get('g2')?.title).toBe('Group g2');
  });
});
