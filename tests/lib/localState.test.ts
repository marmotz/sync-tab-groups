import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browserMock } from '../setup';
import { readLocalGroupState } from '../../src/lib/localState';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('readLocalGroupState', () => {
  it('converts a local tab group and its tabs into a SyncedGroup, sorted by tab index', async () => {
    browserMock.tabGroups.get.mockResolvedValue({
      id: 7,
      title: 'Work',
      color: 'blue',
      collapsed: false,
      windowId: 1,
    });
    browserMock.tabs.query.mockResolvedValue([
      { id: 20, index: 3, url: 'https://b.example', title: 'B' },
      { id: 10, index: 1, url: 'https://a.example', title: 'A' },
    ]);

    const result = await readLocalGroupState(7, 'sync-1', 'device-1');

    expect(result).toEqual({
      id: 'sync-1',
      title: 'Work',
      color: 'blue',
      collapsed: false,
      tabs: [
        { url: 'https://a.example', title: 'A', index: 0 },
        { url: 'https://b.example', title: 'B', index: 1 },
      ],
      updatedAt: expect.any(Number),
      updatedBy: 'device-1',
    });
    expect(browserMock.tabs.query).toHaveBeenCalledWith({ groupId: 7 });
  });

  it('includes the custom title of renamed tabs only', async () => {
    browserMock.tabGroups.get.mockResolvedValue({ id: 7, title: 'Work', color: 'blue', collapsed: false, windowId: 1 });
    browserMock.tabs.query.mockResolvedValue([
      { id: 10, index: 0, url: 'https://a.example', title: 'Mine' },
      { id: 20, index: 1, url: 'https://b.example', title: 'B' },
    ]);
    browserMock.sessions.getTabValue.mockImplementation(async (tabId: number) =>
      tabId === 10 ? 'Mine' : undefined,
    );

    const result = await readLocalGroupState(7, 'sync-1', 'device-1');

    expect(result.tabs).toEqual([
      { url: 'https://a.example', title: 'Mine', index: 0, customTitle: 'Mine' },
      { url: 'https://b.example', title: 'B', index: 1 },
    ]);
    expect(result.tabs[1]).not.toHaveProperty('customTitle');
    browserMock.sessions.getTabValue.mockReset();
  });

  it('falls back to empty strings for missing tab url/title', async () => {
    browserMock.tabGroups.get.mockResolvedValue({ id: 7, color: 'grey', collapsed: false, windowId: 1 });
    browserMock.tabs.query.mockResolvedValue([{ id: 1, index: 0 }]);

    const result = await readLocalGroupState(7, 'sync-1', 'device-1');

    expect(result.title).toBe('');
    expect(result.tabs).toEqual([{ url: '', title: '', index: 0 }]);
  });
});
