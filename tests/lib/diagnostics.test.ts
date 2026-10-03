import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browserMock } from '../setup';

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  browserMock.storage.local.__reset();
  browserMock.storage.sync.__reset();
});

describe('logSyncState', () => {
  it('does nothing when logging is disabled', async () => {
    browserMock.management.getSelf.mockResolvedValue({ installType: 'normal' });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { logSyncState } = await import('../../src/lib/diagnostics');
    await logSyncState('test');
    await flush();

    expect(logSpy).not.toHaveBeenCalled();
    expect(browserMock.tabGroups.query).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('dumps mappings, local groups and synced groups when debug is on', async () => {
    browserMock.management.getSelf.mockResolvedValue({ installType: 'normal' });
    await browserMock.storage.local.set({ debugMode: true, localGroupMap: { '7': 'sync-1', '9': 'sync-gone' } });
    await browserMock.storage.sync.set({
      'group:sync-1': { id: 'sync-1', title: 'Work', color: 'blue', collapsed: false, tabs: [], updatedAt: 1, updatedBy: 'dev-b' },
    });
    browserMock.tabGroups.query.mockResolvedValue([{ id: 7, title: 'Work', windowId: 1 }]);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { logSyncState } = await import('../../src/lib/diagnostics');
    await logSyncState('init');
    await flush();

    const details = logSpy.mock.calls[0]?.[3] as {
      mappings: Array<{ syncId: string; localGroupExists: boolean; syncedGroupExists: boolean }>;
      syncedGroups: Array<{ id: string }>;
    };
    expect(details.mappings).toEqual([
      { localGroupId: 7, syncId: 'sync-1', localGroupExists: true, syncedGroupExists: true },
      { localGroupId: 9, syncId: 'sync-gone', localGroupExists: false, syncedGroupExists: false },
    ]);
    expect(details.syncedGroups.map((group) => group.id)).toEqual(['sync-1']);
    logSpy.mockRestore();
  });
});

describe('buildDebugDump', () => {
  it('collects groups, tabs, renamed tabs and a sync fingerprint', async () => {
    browserMock.management.getSelf.mockResolvedValue({ installType: 'normal' });
    await browserMock.storage.local.set({ localGroupMap: { '7': 'sync-1' } });
    await browserMock.storage.sync.set({
      'group:sync-1': { id: 'sync-1', title: 'Work', color: 'blue', collapsed: false, tabs: [], updatedAt: 1, updatedBy: 'dev-b' },
    });
    browserMock.tabGroups.query.mockResolvedValue([{ id: 7, title: 'Work', color: 'blue', collapsed: false, windowId: 1 }]);
    browserMock.tabs.query.mockResolvedValue([
      { id: 1, index: 0, groupId: 7, url: 'https://a.example', title: 'A' },
      { id: 2, index: 1, groupId: -1, url: 'https://b.example', title: 'B' },
    ]);
    browserMock.sessions.getTabValue.mockImplementation(async (tabId: number) => (tabId === 1 ? 'Mine' : undefined));

    const { buildDebugDump } = await import('../../src/lib/diagnostics');
    const dump = (await buildDebugDump()) as {
      localGroups: Array<{ syncId: string | null; tabs: Array<{ customTitle?: string }> }>;
      renamedTabs: Array<{ tabId: number; syncId: string | null; customTitle: string }>;
      account: { groupCount: number; fingerprint: string };
      syncedGroups: unknown[];
    };

    expect(dump.localGroups[0]?.syncId).toBe('sync-1');
    expect(dump.localGroups[0]?.tabs[0]?.customTitle).toBe('Mine');
    expect(dump.renamedTabs).toEqual([
      { tabId: 1, groupId: 7, syncId: 'sync-1', url: 'https://a.example', pageTitle: 'A', customTitle: 'Mine' },
    ]);
    expect(dump.account.groupCount).toBe(1);
    expect(dump.account.fingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(dump.syncedGroups).toHaveLength(1);
  });
});
