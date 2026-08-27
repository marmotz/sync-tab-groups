import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runMergeChoice } from '../../src/popup/conflictChoice';
import * as groupActions from '../../src/lib/groupActions';
import type { SyncedGroupInfo } from '../../src/lib/groupActions';

vi.mock('../../src/lib/groupActions', () => ({
  openGroup: vi.fn().mockResolvedValue(undefined),
  renameLocalGroupToAvoidConflict: vi.fn().mockResolvedValue(undefined),
  adoptLocalOverSynced: vi.fn().mockResolvedValue(undefined),
  adoptSyncedOverLocal: vi.fn().mockResolvedValue(undefined),
  mergeLocalAndSynced: vi.fn().mockResolvedValue(undefined),
}));

const info: SyncedGroupInfo = {
  syncId: 'sync-1',
  group: {
    id: 'sync-1',
    title: 'Work',
    color: 'grey',
    collapsed: false,
    tabs: [],
    updatedAt: 1,
    updatedBy: 'device-1',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runMergeChoice', () => {
  it('renames the local group then opens the synced group', async () => {
    await runMergeChoice('renameLocal', info, 3);

    expect(groupActions.renameLocalGroupToAvoidConflict).toHaveBeenCalledWith(3, 'Work');
    expect(groupActions.openGroup).toHaveBeenCalledWith('sync-1', info.group);
  });

  it('keeps the local tabs via adoptLocalOverSynced', async () => {
    await runMergeChoice('keepLocal', info, 3);

    expect(groupActions.adoptLocalOverSynced).toHaveBeenCalledWith('sync-1', 3);
  });

  it('keeps the cloud tabs via adoptSyncedOverLocal', async () => {
    await runMergeChoice('keepCloud', info, 3);

    expect(groupActions.adoptSyncedOverLocal).toHaveBeenCalledWith('sync-1', 3, info.group);
  });

  it('merges via mergeLocalAndSynced', async () => {
    await runMergeChoice('merge', info, 3);

    expect(groupActions.mergeLocalAndSynced).toHaveBeenCalledWith('sync-1', 3, info.group);
  });
});
