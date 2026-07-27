import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browserMock } from '../setup';
import { clearSnapshot, getSnapshot, hasChangedSinceSnapshot, setSnapshot } from '../../src/lib/snapshot';
import type { SyncedGroup } from '../../src/lib/model';

function makeGroup(overrides: Partial<SyncedGroup> = {}): SyncedGroup {
  return {
    id: 'g1',
    title: 'Work',
    color: 'blue',
    collapsed: false,
    tabs: [{ url: 'https://a.example', title: 'A', index: 0 }],
    updatedAt: 1,
    updatedBy: 'device-1',
    ...overrides,
  };
}

beforeEach(() => {
  browserMock.storage.local.__reset();
  vi.clearAllMocks();
});

describe('snapshot store', () => {
  it('returns undefined when no snapshot was saved', async () => {
    expect(await getSnapshot('g1')).toBeUndefined();
  });

  it('saves and retrieves a snapshot by syncId', async () => {
    const group = makeGroup();
    await setSnapshot('g1', group);
    expect(await getSnapshot('g1')).toEqual(group);
  });

  it('clears a snapshot', async () => {
    await setSnapshot('g1', makeGroup());
    await clearSnapshot('g1');
    expect(await getSnapshot('g1')).toBeUndefined();
  });

  it('keeps snapshots of different groups independent', async () => {
    await setSnapshot('g1', makeGroup({ id: 'g1', title: 'A' }));
    await setSnapshot('g2', makeGroup({ id: 'g2', title: 'B' }));
    expect((await getSnapshot('g1'))?.title).toBe('A');
    expect((await getSnapshot('g2'))?.title).toBe('B');
  });
});

describe('hasChangedSinceSnapshot', () => {
  it('is true when there is no prior snapshot', async () => {
    expect(await hasChangedSinceSnapshot('g1', makeGroup())).toBe(true);
  });

  it('is false when content is unchanged (ignoring updatedAt/updatedBy)', async () => {
    await setSnapshot('g1', makeGroup({ updatedAt: 1, updatedBy: 'd1' }));
    const current = makeGroup({ updatedAt: 999, updatedBy: 'd2' });
    expect(await hasChangedSinceSnapshot('g1', current)).toBe(false);
  });

  it('is true when the tab list changed', async () => {
    await setSnapshot('g1', makeGroup());
    const current = makeGroup({ tabs: [{ url: 'https://new.example', title: 'New', index: 0 }] });
    expect(await hasChangedSinceSnapshot('g1', current)).toBe(true);
  });
});
