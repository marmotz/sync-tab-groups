import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browserMock } from '../setup';
import { closeGroup, forceSyncNow, listSyncedGroups, listUnsharedLocalGroups } from '../../src/lib/groupActions';
import { consumeIntentionalClose } from '../../src/lib/intentionalClose';
import { getLocalGroupIdForSyncId, setMapping } from '../../src/lib/localGroupMap';
import type { SyncedGroup } from '../../src/lib/model';
import { setSyncedGroup } from '../../src/lib/syncStorage';

beforeEach(() => {
  browserMock.storage.local.__reset();
  browserMock.storage.sync.__reset();
  vi.resetAllMocks();
  browserMock.management.getSelf.mockResolvedValue({ installType: 'normal' });
});

function makeGroup(overrides: Partial<SyncedGroup> = {}): SyncedGroup {
  return {
    id: 'sync-1',
    title: 'Work',
    color: 'grey',
    collapsed: false,
    tabs: [{ url: 'https://a.example', title: 'A', index: 0 }],
    updatedAt: 1,
    updatedBy: 'device-2',
    ...overrides,
  };
}

describe('forceSyncNow', () => {
  it('re-applies every synced group that has a local mapping', async () => {
    const group = makeGroup();
    await setSyncedGroup(group);
    await setMapping(7, group.id);

    browserMock.tabGroups.get.mockResolvedValue({ id: 7, windowId: 1, title: '', color: 'grey', collapsed: false });
    browserMock.tabs.query.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    browserMock.tabs.create.mockResolvedValue({ id: 42 });

    await forceSyncNow();

    expect(browserMock.tabs.create).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://a.example' }),
    );
    expect(browserMock.tabGroups.update).toHaveBeenCalledWith(7, {
      title: 'Work',
      color: 'grey',
      collapsed: false,
    });
  });

  it('skips synced groups that are not open locally', async () => {
    await setSyncedGroup(makeGroup());

    await forceSyncNow();

    expect(browserMock.tabGroups.get).not.toHaveBeenCalled();
    expect(browserMock.tabs.query).not.toHaveBeenCalled();
  });

  it('cleans up a stale mapping instead of applying to a group that no longer exists', async () => {
    const group = makeGroup();
    await setSyncedGroup(group);
    await setMapping(7, group.id);

    browserMock.tabGroups.get.mockRejectedValue(new Error('No group with id: 7'));

    await forceSyncNow();

    expect(browserMock.tabs.query).not.toHaveBeenCalled();
    expect(await getLocalGroupIdForSyncId(group.id)).toBeUndefined();
  });
});

describe('listUnsharedLocalGroups', () => {
  it('orders groups by their tab position in the browser', async () => {
    browserMock.tabGroups.query.mockResolvedValue([
      { id: 2, windowId: 1, title: 'Second', color: 'blue', collapsed: false },
      { id: 1, windowId: 1, title: 'First', color: 'red', collapsed: false },
    ]);
    browserMock.tabs.query.mockImplementation(
      async (queryInfo: { groupId?: number } = {}): Promise<Array<{ index: number; groupId?: number; windowId?: number }>> => {
        if (queryInfo.groupId === 1) {
          return [{ index: 0 }];
        }
        if (queryInfo.groupId === 2) {
          return [{ index: 3 }];
        }
        return [
          { groupId: 1, windowId: 1, index: 0 },
          { groupId: 2, windowId: 1, index: 3 },
        ];
      },
    );

    const result = await listUnsharedLocalGroups();

    expect(result.map((group) => group.title)).toEqual(['First', 'Second']);
  });
});

describe('listSyncedGroups', () => {
  it('orders open groups by browser position and closed groups alphabetically', async () => {
    const openA = makeGroup({ id: 'sync-open-a', title: 'Zebra' });
    const openB = makeGroup({ id: 'sync-open-b', title: 'Alpha' });
    const closedA = makeGroup({ id: 'sync-closed-a', title: 'Zeta' });
    const closedB = makeGroup({ id: 'sync-closed-b', title: 'Beta' });

    await setSyncedGroup(openA);
    await setSyncedGroup(openB);
    await setSyncedGroup(closedA);
    await setSyncedGroup(closedB);

    await setMapping(10, openA.id);
    await setMapping(5, openB.id);

    browserMock.tabs.query.mockResolvedValue([
      { groupId: 10, windowId: 1, index: 5 },
      { groupId: 5, windowId: 1, index: 1 },
    ]);

    const result = await listSyncedGroups();

    expect(result.map((info) => info.group.title)).toEqual(['Alpha', 'Zebra', 'Beta', 'Zeta']);
  });

  it('treats a group as closed and clears its mapping when the local tabGroup no longer exists', async () => {
    const group = makeGroup({ id: 'sync-stale', title: 'Stale' });
    await setSyncedGroup(group);
    await setMapping(99, group.id);

    browserMock.tabGroups.get.mockRejectedValue(new Error('No group with id: 99'));
    browserMock.tabs.query.mockResolvedValue([]);

    const result = await listSyncedGroups();

    expect(result.find((info) => info.syncId === group.id)?.localGroupId).toBeUndefined();
    expect(await getLocalGroupIdForSyncId(group.id)).toBeUndefined();
  });
});

describe('closeGroup', () => {
  it('closes the local tabGroup when it still exists', async () => {
    browserMock.tabGroups.get.mockResolvedValue({ id: 7, windowId: 1, title: '', color: 'grey', collapsed: false });
    browserMock.tabs.query.mockResolvedValue([{ id: 1, groupId: 7 }]);

    await closeGroup(7);

    expect(browserMock.tabs.remove).toHaveBeenCalledWith([1]);
  });

  it('marks the close as intentional so the background listener keeps the synced data', async () => {
    browserMock.tabGroups.get.mockResolvedValue({ id: 7, windowId: 1, title: '', color: 'grey', collapsed: false });
    browserMock.tabs.query.mockResolvedValue([{ id: 1, groupId: 7 }]);

    await closeGroup(7);

    expect(await consumeIntentionalClose(7)).toBe(true);
  });

  it('clears the mapping instead of failing silently when the tabGroup is already gone', async () => {
    const group = makeGroup({ id: 'sync-gone' });
    await setSyncedGroup(group);
    await setMapping(7, group.id);
    browserMock.tabGroups.get.mockRejectedValue(new Error('No group with id: 7'));

    await closeGroup(7);

    expect(browserMock.tabs.remove).not.toHaveBeenCalled();
    expect(await getLocalGroupIdForSyncId(group.id)).toBeUndefined();
  });
});
