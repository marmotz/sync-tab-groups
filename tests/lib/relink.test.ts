import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browserMock } from '../setup';
import { listSyncedGroups, listUnsharedLocalGroups } from '../../src/lib/groupActions';
import { getLocalGroupIdForSyncId, setMapping } from '../../src/lib/localGroupMap';
import { relinkRestoredGroups } from '../../src/lib/relink';
import type { SyncedGroup } from '../../src/lib/model';
import { getSnapshot, setSnapshot } from '../../src/lib/snapshot';
import { setSyncedGroup } from '../../src/lib/syncStorage';

function makeGroup(overrides: Partial<SyncedGroup> = {}): SyncedGroup {
  return {
    id: 'sync-1',
    title: 'Work',
    color: 'grey',
    collapsed: false,
    tabs: [
      { url: 'https://a.example', title: 'A', index: 0 },
      { url: 'https://b.example', title: 'B', index: 1 },
    ],
    updatedAt: 1,
    updatedBy: 'device-1',
    ...overrides,
  };
}

interface FakeGroup {
  id: number;
  title: string;
  urls: string[];
}

// Simulates the browser after a restart: tab group ids are session-scoped, so the
// restored groups come back under new ids.
function mockBrowserGroups(groups: FakeGroup[]): void {
  browserMock.tabGroups.query.mockResolvedValue(
    groups.map((g) => ({ id: g.id, title: g.title, color: 'grey', collapsed: false, windowId: 1 })),
  );
  browserMock.tabGroups.get.mockImplementation(async (id: number) => {
    const group = groups.find((g) => g.id === id);
    if (group === undefined) {
      throw new Error('No tab group with id');
    }
    return { id, title: group.title, color: 'grey', collapsed: false, windowId: 1 };
  });
  browserMock.tabs.query.mockImplementation(async (query: { groupId?: number }) => {
    if (query.groupId === undefined) {
      return groups.flatMap((g) =>
        g.urls.map((url, i) => ({ id: g.id * 100 + i, groupId: g.id, windowId: 1, index: i, url })),
      );
    }
    const group = groups.find((g) => g.id === query.groupId);
    return (group?.urls ?? []).map((url, i) => ({ id: g0(query.groupId) + i, groupId: query.groupId, windowId: 1, index: i, url }));
  });
}

function g0(groupId: number | undefined): number {
  return (groupId ?? 0) * 100;
}

beforeEach(() => {
  browserMock.storage.local.__reset();
  browserMock.storage.sync.__reset();
  vi.resetAllMocks();
  browserMock.management.getSelf.mockResolvedValue({ installType: 'normal' });
});

describe('relinkRestoredGroups', () => {
  it('re-links a restored group under its new id instead of listing it twice', async () => {
    const group = makeGroup();
    await setSyncedGroup(group);
    await setSnapshot(group.id, group);
    await setMapping(5, group.id);
    mockBrowserGroups([{ id: 9, title: 'Work', urls: ['https://a.example', 'https://b.example'] }]);

    const relinked = await relinkRestoredGroups();

    expect(relinked).toEqual([9]);
    expect(await getLocalGroupIdForSyncId(group.id)).toBe(9);
    expect(await listUnsharedLocalGroups()).toEqual([]);
    const synced = await listSyncedGroups();
    expect(synced.map((info) => info.localGroupId)).toEqual([9]);
    expect(await getSnapshot(group.id)).toBeUndefined();
  });

  it('drops a stale mapping whose id now belongs to an unrelated group', async () => {
    const group = makeGroup();
    await setSyncedGroup(group);
    await setMapping(5, group.id);
    mockBrowserGroups([{ id: 5, title: 'Holidays', urls: ['https://z.example'] }]);

    const relinked = await relinkRestoredGroups();

    expect(relinked).toEqual([]);
    expect(await getLocalGroupIdForSyncId(group.id)).toBeUndefined();
    expect((await listUnsharedLocalGroups()).map((info) => info.localGroupId)).toEqual([5]);
  });

  it('picks the same-titled group with the most tabs in common', async () => {
    const group = makeGroup();
    await setSyncedGroup(group);
    await setMapping(5, group.id);
    mockBrowserGroups([
      { id: 8, title: 'work', urls: ['https://x.example'] },
      { id: 9, title: 'Work', urls: ['https://a.example', 'https://b.example'] },
    ]);

    expect(await relinkRestoredGroups()).toEqual([9]);
    expect(await getLocalGroupIdForSyncId(group.id)).toBe(9);
  });

  it('never links one local group to two synced groups', async () => {
    await setSyncedGroup(makeGroup({ id: 'sync-1' }));
    await setSyncedGroup(makeGroup({ id: 'sync-2' }));
    await setMapping(5, 'sync-1');
    await setMapping(6, 'sync-2');
    mockBrowserGroups([{ id: 9, title: 'Work', urls: ['https://a.example'] }]);

    expect(await relinkRestoredGroups()).toEqual([9]);
    // sync-2 found no free group: it stays pending on its old (absent) id, never on 9.
    expect(await getLocalGroupIdForSyncId('sync-1')).toBe(9);
    expect(await getLocalGroupIdForSyncId('sync-2')).toBe(6);
  });

  it('ignores mappings whose synced group no longer exists', async () => {
    await setMapping(5, 'gone');
    mockBrowserGroups([{ id: 9, title: 'Work', urls: ['https://a.example'] }]);

    expect(await relinkRestoredGroups()).toEqual([]);
    expect(await getLocalGroupIdForSyncId('gone')).toBeUndefined();
  });

  it('keeps the mapping and snapshot when the id survived the restart with the same title', async () => {
    const group = makeGroup();
    await setSyncedGroup(group);
    await setSnapshot(group.id, group);
    await setMapping(5, group.id);
    mockBrowserGroups([{ id: 5, title: 'work', urls: ['https://a.example', 'https://b.example'] }]);

    expect(await relinkRestoredGroups()).toEqual([]);
    expect(await getLocalGroupIdForSyncId(group.id)).toBe(5);
    expect(await getSnapshot(group.id)).toBeDefined();
  });

  it('keeps the mapping while the group is not restored yet, then re-links it on the next run', async () => {
    const group = makeGroup();
    await setSyncedGroup(group);
    await setSnapshot(group.id, group);
    await setMapping(5, group.id);

    mockBrowserGroups([]);
    expect(await relinkRestoredGroups()).toEqual([]);
    expect(await getLocalGroupIdForSyncId(group.id)).toBe(5);
    expect(await getSnapshot(group.id)).toBeDefined();

    mockBrowserGroups([{ id: 9, title: 'Work', urls: ['https://a.example'] }]);
    expect(await relinkRestoredGroups()).toEqual([9]);
    expect(await getLocalGroupIdForSyncId(group.id)).toBe(9);
  });
});
