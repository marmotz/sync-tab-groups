import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browserMock } from '../setup';
import {
  getAllMappedLocalGroupIds,
  getLocalGroupIdForSyncId,
  getSyncIdForLocalGroup,
  removeMappingByLocalGroupId,
  removeMappingBySyncId,
  setMapping,
} from '../../src/lib/localGroupMap';

beforeEach(() => {
  browserMock.storage.local.__reset();
  vi.clearAllMocks();
});

describe('localGroupMap', () => {
  it('has no mapping initially', async () => {
    expect(await getSyncIdForLocalGroup(42)).toBeUndefined();
    expect(await getLocalGroupIdForSyncId('sync-1')).toBeUndefined();
  });

  it('maps a local group id to a syncId in both directions', async () => {
    await setMapping(42, 'sync-1');
    expect(await getSyncIdForLocalGroup(42)).toBe('sync-1');
    expect(await getLocalGroupIdForSyncId('sync-1')).toBe(42);
  });

  it('removes a mapping by local group id', async () => {
    await setMapping(42, 'sync-1');
    await removeMappingByLocalGroupId(42);
    expect(await getSyncIdForLocalGroup(42)).toBeUndefined();
  });

  it('removes a mapping by syncId', async () => {
    await setMapping(42, 'sync-1');
    await removeMappingBySyncId('sync-1');
    expect(await getLocalGroupIdForSyncId('sync-1')).toBeUndefined();
  });

  it('lists all mapped local group ids', async () => {
    await setMapping(1, 'sync-1');
    await setMapping(2, 'sync-2');
    const ids = await getAllMappedLocalGroupIds();
    expect(ids).toEqual(new Set([1, 2]));
  });
});
