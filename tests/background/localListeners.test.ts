import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browserMock } from '../setup';
import { handleGroupRemoved, noteTabLeavingGroup, runSyncLocalGroup } from '../../src/background/localListeners';
import { markIntentionalClose } from '../../src/lib/intentionalClose';
import { getLocalGroupIdForSyncId } from '../../src/lib/localGroupMap';

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// The "catch-up" rerun triggered from inside runSyncLocalGroup's finally block is
// fire-and-forget (not awaited by the run that scheduled it), so tests need to let its
// own chain of awaits drain before asserting on its effects.
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  browserMock.storage.local.__reset();
  browserMock.storage.sync.__reset();
  // devLog() fires on every branch of syncLocalGroup; give it a resolved installType so
  // it doesn't produce unhandled rejections unrelated to what these tests assert on.
  browserMock.management.getSelf.mockResolvedValue({ installType: 'normal' });
});

describe('runSyncLocalGroup - overlapping runs for the same group', () => {
  it('does not let a slow, stale run clobber a snapshot written by a run that started later', async () => {
    await browserMock.storage.local.set({ localGroupMap: { '7': 'sync-1' } });
    browserMock.tabGroups.get.mockResolvedValue({ id: 7, title: 'Staging', color: 'blue', collapsed: false, windowId: 1 });

    const staleRead = deferred<unknown[]>();
    const freshRead = [{ id: 1, index: 0, url: 'https://a.example', title: 'A' }];

    // The first triggered run reads a stale (2-tab) state but only resolves once we say so.
    // The run queued behind it (because the first one was still in flight) reads the fresh
    // (1-tab) state and must resolve fast, i.e. `tabs.query` is called at most twice here.
    browserMock.tabs.query.mockReturnValueOnce(staleRead.promise).mockResolvedValueOnce(freshRead);

    const firstRun = runSyncLocalGroup(7);
    // A second trigger arrives while the first run is still awaiting its (slow) tabs.query.
    const secondRun = runSyncLocalGroup(7);

    staleRead.resolve([
      { id: 1, index: 0, url: 'https://a.example', title: 'A' },
      { id: 2, index: 1, url: 'https://stale.example', title: 'Stale' },
    ]);

    await firstRun;
    await secondRun;
    await flush();

    const stored = await browserMock.storage.sync.get('group:sync-1');
    const savedGroup = stored['group:sync-1'] as { tabs: Array<{ url: string }> };
    expect(savedGroup.tabs.map((tab) => tab.url)).toEqual(['https://a.example']);
  });

  it('runs a second trigger normally when the first one has already finished', async () => {
    await browserMock.storage.local.set({ localGroupMap: { '7': 'sync-1' } });
    browserMock.tabGroups.get.mockResolvedValue({ id: 7, title: 'Staging', color: 'blue', collapsed: false, windowId: 1 });
    browserMock.tabs.query.mockResolvedValue([{ id: 1, index: 0, url: 'https://a.example', title: 'A' }]);

    await runSyncLocalGroup(7);
    await runSyncLocalGroup(7);

    // Second run finds no change versus the snapshot the first run just wrote: single write only.
    expect(browserMock.storage.sync.set).toHaveBeenCalledTimes(1);
  });
});

describe('handleGroupRemoved', () => {
  it('keeps the synced group data when the close was marked intentional (the "Fermer" button), even if the group had only one tab left', async () => {
    await browserMock.storage.local.set({ localGroupMap: { '7': 'sync-1' } });
    await browserMock.storage.sync.set({ 'group:sync-1': { id: 'sync-1', title: 'Work', tabs: [] } });
    await markIntentionalClose(7);
    noteTabLeavingGroup(7, 1);

    await handleGroupRemoved(7, 'Work');

    expect(browserMock.storage.sync.remove).not.toHaveBeenCalled();
    expect(await getLocalGroupIdForSyncId('sync-1')).toBeUndefined();
    const stored = await browserMock.storage.sync.get('group:sync-1');
    expect(stored['group:sync-1']).toBeDefined();
  });

  it('deletes the synced group when it emptied out tab-by-tab (last tab closed alone, no intentional marker)', async () => {
    await browserMock.storage.local.set({ localGroupMap: { '7': 'sync-1' } });
    await browserMock.storage.sync.set({ 'group:sync-1': { id: 'sync-1', title: 'Work', tabs: [] } });
    noteTabLeavingGroup(7, 1);

    await handleGroupRemoved(7, 'Work');

    expect(browserMock.storage.sync.remove).toHaveBeenCalledWith('group:sync-1');
    expect(await getLocalGroupIdForSyncId('sync-1')).toBeUndefined();
    const stored = await browserMock.storage.sync.get('group:sync-1');
    expect(stored['group:sync-1']).toBeUndefined();
  });

  it('keeps the synced group data when several tabs disappeared at once (e.g. native "Delete group"), even without an intentional marker', async () => {
    await browserMock.storage.local.set({ localGroupMap: { '7': 'sync-1' } });
    await browserMock.storage.sync.set({ 'group:sync-1': { id: 'sync-1', title: 'Work', tabs: [] } });
    noteTabLeavingGroup(7, 2);

    await handleGroupRemoved(7, 'Work');

    expect(browserMock.storage.sync.remove).not.toHaveBeenCalled();
    const stored = await browserMock.storage.sync.get('group:sync-1');
    expect(stored['group:sync-1']).toBeDefined();
  });

  it('keeps the synced group data when no removal-burst info was recorded at all (safe default)', async () => {
    await browserMock.storage.local.set({ localGroupMap: { '7': 'sync-1' } });
    await browserMock.storage.sync.set({ 'group:sync-1': { id: 'sync-1', title: 'Work', tabs: [] } });

    await handleGroupRemoved(7, 'Work');

    expect(browserMock.storage.sync.remove).not.toHaveBeenCalled();
    const stored = await browserMock.storage.sync.get('group:sync-1');
    expect(stored['group:sync-1']).toBeDefined();
  });

  it('does nothing when the removed group had no sync mapping', async () => {
    await handleGroupRemoved(7, 'Untracked');

    expect(browserMock.storage.sync.remove).not.toHaveBeenCalled();
  });
});
