import { describe, expect, it } from 'vitest';
import {
  diffTabUrls,
  groupContentEqual,
  isSyncedGroupKey,
  syncedGroupIdFromKey,
  syncedGroupKey,
  tabsEqual,
  type SyncedGroup,
} from '../../src/lib/model';

function makeGroup(overrides: Partial<SyncedGroup> = {}): SyncedGroup {
  return {
    id: 'g1',
    title: 'Work',
    color: 'blue',
    collapsed: false,
    tabs: [
      { url: 'https://a.example', title: 'A', index: 0 },
      { url: 'https://b.example', title: 'B', index: 1 },
    ],
    updatedAt: 1000,
    updatedBy: 'device-1',
    ...overrides,
  };
}

describe('syncedGroupKey / isSyncedGroupKey / syncedGroupIdFromKey', () => {
  it('round-trips an id through a storage key', () => {
    const key = syncedGroupKey('abc-123');
    expect(key).toBe('group:abc-123');
    expect(isSyncedGroupKey(key)).toBe(true);
    expect(syncedGroupIdFromKey(key)).toBe('abc-123');
  });

  it('rejects keys without the group prefix', () => {
    expect(isSyncedGroupKey('deviceId')).toBe(false);
  });
});

describe('tabsEqual', () => {
  it('is true for identical tab lists', () => {
    const a = makeGroup().tabs;
    const b = makeGroup().tabs;
    expect(tabsEqual(a, b)).toBe(true);
  });

  it('is false when lengths differ', () => {
    const a = makeGroup().tabs;
    const b = [a[0]!];
    expect(tabsEqual(a, b)).toBe(false);
  });

  it('is false when a url differs', () => {
    const a = makeGroup().tabs;
    const b = makeGroup().tabs;
    b[0]!.url = 'https://changed.example';
    expect(tabsEqual(a, b)).toBe(false);
  });

  it('is false when order differs', () => {
    const a = makeGroup().tabs;
    const b = [...makeGroup().tabs].reverse();
    expect(tabsEqual(a, b)).toBe(false);
  });
});

describe('groupContentEqual', () => {
  it('ignores updatedAt/updatedBy and compares content only', () => {
    const a = makeGroup({ updatedAt: 1, updatedBy: 'd1' });
    const b = makeGroup({ updatedAt: 2, updatedBy: 'd2' });
    expect(groupContentEqual(a, b)).toBe(true);
  });

  it('is false when the title changes', () => {
    const a = makeGroup();
    const b = makeGroup({ title: 'Renamed' });
    expect(groupContentEqual(a, b)).toBe(false);
  });

  it('is false when collapsed changes', () => {
    const a = makeGroup();
    const b = makeGroup({ collapsed: true });
    expect(groupContentEqual(a, b)).toBe(false);
  });
});

describe('diffTabUrls', () => {
  it('reports no changes for identical tab lists', () => {
    const tabs = makeGroup().tabs;
    expect(diffTabUrls(tabs, tabs)).toEqual({ added: [], removed: [] });
  });

  it('reports a newly added tab url', () => {
    const previous = makeGroup().tabs;
    const current = [...previous, { url: 'https://new.example', title: 'New', index: 2 }];
    expect(diffTabUrls(previous, current)).toEqual({ added: ['https://new.example'], removed: [] });
  });

  it('reports a removed tab url', () => {
    const previous = makeGroup().tabs;
    const current = [previous[0]!];
    expect(diffTabUrls(previous, current)).toEqual({ added: [], removed: [previous[1]!.url] });
  });

  it('reports both additions and removals at once', () => {
    const previous = [{ url: 'https://a.example', title: 'A', index: 0 }];
    const current = [{ url: 'https://b.example', title: 'B', index: 0 }];
    expect(diffTabUrls(previous, current)).toEqual({ added: ['https://b.example'], removed: ['https://a.example'] });
  });
});
