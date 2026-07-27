import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browserMock } from '../setup';
import { forceSyncNow } from '../../src/lib/groupActions';
import { setMapping } from '../../src/lib/localGroupMap';
import type { SyncedGroup } from '../../src/lib/model';
import { setSyncedGroup } from '../../src/lib/syncStorage';

beforeEach(() => {
  browserMock.storage.local.__reset();
  browserMock.storage.sync.__reset();
  vi.clearAllMocks();
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
});
