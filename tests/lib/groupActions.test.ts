import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browserMock } from '../setup';
import {
  adoptLocalOverSynced,
  adoptSyncedOverLocal,
  closeGroup,
  findLocalNameConflicts,
  forceSyncNow,
  listSyncedGroups,
  listUnsharedLocalGroups,
  mergeLocalAndSynced,
  normalizeGroupTitle,
  renameLocalGroupToAvoidConflict,
} from '../../src/lib/groupActions';
import { consumeIntentionalClose } from '../../src/lib/intentionalClose';
import { getLocalGroupIdForSyncId, setMapping } from '../../src/lib/localGroupMap';
import type { SyncedGroup } from '../../src/lib/model';
import { getSnapshot } from '../../src/lib/snapshot';
import { getSyncedGroup, setSyncedGroup } from '../../src/lib/syncStorage';

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

describe('normalizeGroupTitle', () => {
  it('is case- and surrounding-whitespace-insensitive', () => {
    expect(normalizeGroupTitle('  Work ')).toBe(normalizeGroupTitle('work'));
    expect(normalizeGroupTitle('WORK')).toBe('work');
  });
});

describe('findLocalNameConflicts', () => {
  function mockLocalGroups(groups: Array<{ id: number; title: string; index: number }>): void {
    browserMock.tabGroups.query.mockResolvedValue(
      groups.map((g) => ({ id: g.id, windowId: 1, title: g.title, color: 'grey', collapsed: false })),
    );
    browserMock.tabs.query.mockImplementation(async (queryInfo: { groupId?: number } = {}) => {
      if (queryInfo.groupId !== undefined) {
        return [{ index: 0 }];
      }
      return groups.map((g) => ({ groupId: g.id, windowId: 1, index: g.index }));
    });
  }

  it('matches ignoring case and surrounding whitespace', async () => {
    mockLocalGroups([
      { id: 1, title: '  work ', index: 0 },
      { id: 2, title: 'Other', index: 1 },
    ]);

    const result = await findLocalNameConflicts('WORK');

    expect(result.map((info) => info.localGroupId)).toEqual([1]);
  });

  it('returns an empty list when no local group has the same name', async () => {
    mockLocalGroups([{ id: 1, title: 'Other', index: 0 }]);

    expect(await findLocalNameConflicts('Work')).toEqual([]);
  });

  it('returns every homonym in display order', async () => {
    mockLocalGroups([
      { id: 2, title: 'Work', index: 5 },
      { id: 1, title: 'work', index: 1 },
    ]);

    const result = await findLocalNameConflicts('Work');

    expect(result.map((info) => info.localGroupId)).toEqual([1, 2]);
  });
});

describe('same-name reconciliation primitives', () => {
  beforeEach(() => {
    browserMock.i18n.getMessage.mockReturnValue('local');
  });

  function mockLocalGroup(tabs: Array<{ id: number; url: string }>): void {
    browserMock.tabGroups.get.mockResolvedValue({
      id: 3,
      windowId: 1,
      title: 'Work',
      color: 'blue',
      collapsed: false,
    });
    browserMock.tabs.query.mockResolvedValue(tabs.map((tab, index) => ({ ...tab, index, groupId: 3 })));
  }

  it('adoptLocalOverSynced writes the mapping, synced group and snapshot', async () => {
    mockLocalGroup([{ id: 10, url: 'https://a.example' }]);

    await adoptLocalOverSynced('sync-1', 3);

    expect(await getLocalGroupIdForSyncId('sync-1')).toBe(3);
    expect((await getSyncedGroup('sync-1'))?.title).toBe('Work');
    expect((await getSnapshot('sync-1'))?.tabs).toHaveLength(1);
  });

  it('adoptSyncedOverLocal aligns local tabs on the remote state before pushing', async () => {
    mockLocalGroup([{ id: 10, url: 'https://a.example' }]);
    browserMock.tabs.create.mockResolvedValue({ id: 99 });

    const remote = makeGroup({
      id: 'sync-2',
      tabs: [{ url: 'https://remote.example', title: 'R', index: 0 }],
    });

    await adoptSyncedOverLocal('sync-2', 3, remote);

    // applyRemoteGroup creates the missing remote tab and drops the local-only one.
    expect(browserMock.tabs.create).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://remote.example' }),
    );
    expect(browserMock.tabs.remove).toHaveBeenCalledWith(10);
    expect(await getLocalGroupIdForSyncId('sync-2')).toBe(3);
  });

  it('mergeLocalAndSynced only creates remote tabs missing locally, then groups them', async () => {
    mockLocalGroup([{ id: 10, url: 'https://a.example' }]);
    browserMock.tabs.create.mockResolvedValue({ id: 77 });

    const remote = makeGroup({
      id: 'sync-3',
      tabs: [
        { url: 'https://a.example', title: 'A', index: 0 },
        { url: 'https://b.example', title: 'B', index: 1 },
      ],
    });

    await mergeLocalAndSynced('sync-3', 3, remote);

    expect(browserMock.tabs.create).toHaveBeenCalledTimes(1);
    expect(browserMock.tabs.create).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://b.example', windowId: 1 }),
    );
    expect(browserMock.tabs.group).toHaveBeenCalledWith({ tabIds: [77], groupId: 3 });
    expect(await getLocalGroupIdForSyncId('sync-3')).toBe(3);
    expect(await getSnapshot('sync-3')).toBeDefined();
  });

  it('renameLocalGroupToAvoidConflict bumps the suffix while the title collides', async () => {
    await setSyncedGroup(makeGroup({ id: 'sync-x', title: 'Work (local 2)' }));
    browserMock.tabGroups.query.mockResolvedValue([
      { id: 3, windowId: 1, title: 'Work', color: 'blue', collapsed: false },
      { id: 4, windowId: 1, title: 'Work (local)', color: 'red', collapsed: false },
    ]);

    await renameLocalGroupToAvoidConflict(3, 'Work');

    expect(browserMock.tabGroups.update).toHaveBeenCalledWith(3, { title: 'Work (local 3)' });
  });

  it('renameLocalGroupToAvoidConflict uses the plain suffix when free', async () => {
    browserMock.tabGroups.query.mockResolvedValue([
      { id: 3, windowId: 1, title: 'Work', color: 'blue', collapsed: false },
    ]);

    await renameLocalGroupToAvoidConflict(3, 'Work');

    expect(browserMock.tabGroups.update).toHaveBeenCalledWith(3, { title: 'Work (local)' });
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
