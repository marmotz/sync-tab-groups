import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browserMock } from '../setup';
import { applyRemoteGroup, closeLocalGroup, localGroupExists, type ReconcileAction } from '../../src/lib/reconciler';
import type { SyncedGroup } from '../../src/lib/model';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('closeLocalGroup', () => {
  it('removes every tab currently in the group', async () => {
    browserMock.tabs.query.mockResolvedValue([
      { id: 1, groupId: 7 },
      { id: 2, groupId: 7 },
    ]);

    await closeLocalGroup(7);

    expect(browserMock.tabs.query).toHaveBeenCalledWith({ groupId: 7 });
    expect(browserMock.tabs.remove).toHaveBeenCalledWith([1, 2]);
  });

  it('does nothing when the group has no tabs', async () => {
    browserMock.tabs.query.mockResolvedValue([]);

    await closeLocalGroup(7);

    expect(browserMock.tabs.remove).not.toHaveBeenCalled();
  });
});

describe('localGroupExists', () => {
  it('returns true when the tabGroup can be fetched', async () => {
    browserMock.tabGroups.get.mockResolvedValue({ id: 7, windowId: 1, title: '', color: 'grey', collapsed: false });

    expect(await localGroupExists(7)).toBe(true);
  });

  it('returns false when the tabGroup no longer exists', async () => {
    browserMock.tabGroups.get.mockRejectedValue(new Error('No group with id: 7'));

    expect(await localGroupExists(7)).toBe(false);
  });
});

describe('applyRemoteGroup', () => {
  it('reports every computed action through onAction, in order, before applying them', async () => {
    const remoteGroup: SyncedGroup = {
      id: 'sync-1',
      title: 'Work',
      color: 'grey',
      collapsed: false,
      tabs: [
        { url: 'https://a.example', title: 'A', index: 0 },
        { url: 'https://new.example', title: 'New', index: 1 },
      ],
      updatedAt: 1,
      updatedBy: 'device-2',
    };

    browserMock.tabGroups.get.mockResolvedValue({ id: 7, windowId: 1, title: '', color: 'grey', collapsed: false });
    browserMock.tabs.query
      .mockResolvedValueOnce([
        { id: 1, index: 0, url: 'https://a.example' },
        { id: 2, index: 1, url: 'https://old.example' },
      ])
      .mockResolvedValueOnce([{ id: 1, index: 0, url: 'https://a.example' }]);
    browserMock.tabs.create.mockResolvedValue({ id: 3 });

    const seenActions: ReconcileAction[] = [];
    await applyRemoteGroup(7, remoteGroup, (action) => seenActions.push(action));

    expect(seenActions).toEqual([
      { type: 'removeTab', tabId: 2 },
      { type: 'moveTab', tabId: 1, groupIndex: 0 },
      { type: 'createTab', url: 'https://new.example', title: 'New', groupIndex: 1 },
    ]);
    expect(browserMock.tabs.remove).toHaveBeenCalledWith(2);
    expect(browserMock.tabs.create).toHaveBeenCalled();
    expect(browserMock.tabs.group).toHaveBeenCalledWith({ tabIds: 3, groupId: 7 });
    expect(browserMock.tabs.move).toHaveBeenCalledWith(1, { index: 0 });
    expect(browserMock.tabGroups.update).toHaveBeenCalledWith(7, {
      title: 'Work',
      color: 'grey',
      collapsed: false,
    });
  });

  it('works without an onAction callback', async () => {
    const remoteGroup: SyncedGroup = {
      id: 'sync-1',
      title: 'Work',
      color: 'grey',
      collapsed: false,
      tabs: [],
      updatedAt: 1,
      updatedBy: 'device-2',
    };

    browserMock.tabGroups.get.mockResolvedValue({ id: 7, windowId: 1, title: '', color: 'grey', collapsed: false });
    browserMock.tabs.query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await expect(applyRemoteGroup(7, remoteGroup)).resolves.toBeUndefined();
  });
});
