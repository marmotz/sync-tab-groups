import { describe, expect, it } from 'vitest';
import { computeReconcileActions, type LocalTabRef } from '../../src/lib/reconciler';
import type { SyncedTab } from '../../src/lib/model';

function tab(url: string, index: number, title = url): SyncedTab {
  return { url, title, index };
}

describe('computeReconcileActions', () => {
  it('returns only moveTab actions when local already matches remote', () => {
    const local: LocalTabRef[] = [
      { id: 1, url: 'https://a.example' },
      { id: 2, url: 'https://b.example' },
    ];
    const remote = [tab('https://a.example', 0), tab('https://b.example', 1)];

    const actions = computeReconcileActions(local, remote);

    expect(actions).toEqual([
      { type: 'moveTab', tabId: 1, groupIndex: 0 },
      { type: 'moveTab', tabId: 2, groupIndex: 1 },
    ]);
  });

  it('creates a tab present remotely but missing locally', () => {
    const local: LocalTabRef[] = [{ id: 1, url: 'https://a.example' }];
    const remote = [tab('https://a.example', 0), tab('https://new.example', 1, 'New')];

    const actions = computeReconcileActions(local, remote);

    expect(actions).toContainEqual({ type: 'moveTab', tabId: 1, groupIndex: 0 });
    expect(actions).toContainEqual({ type: 'createTab', url: 'https://new.example', title: 'New', groupIndex: 1 });
  });

  it('removes a local tab absent from the remote state', () => {
    const local: LocalTabRef[] = [
      { id: 1, url: 'https://a.example' },
      { id: 2, url: 'https://gone.example' },
    ];
    const remote = [tab('https://a.example', 0)];

    const actions = computeReconcileActions(local, remote);

    expect(actions).toContainEqual({ type: 'removeTab', tabId: 2 });
    expect(actions).toContainEqual({ type: 'moveTab', tabId: 1, groupIndex: 0 });
  });

  it('emits removeTab actions before create/move actions', () => {
    const local: LocalTabRef[] = [{ id: 1, url: 'https://gone.example' }];
    const remote = [tab('https://new.example', 0)];

    const actions = computeReconcileActions(local, remote);

    expect(actions[0]).toEqual({ type: 'removeTab', tabId: 1 });
    expect(actions[1]).toEqual({ type: 'createTab', url: 'https://new.example', title: 'https://new.example', groupIndex: 0 });
  });

  it('reorders matched tabs to follow the remote order', () => {
    const local: LocalTabRef[] = [
      { id: 1, url: 'https://a.example' },
      { id: 2, url: 'https://b.example' },
    ];
    const remote = [tab('https://b.example', 0), tab('https://a.example', 1)];

    const actions = computeReconcileActions(local, remote);

    expect(actions).toEqual([
      { type: 'moveTab', tabId: 2, groupIndex: 0 },
      { type: 'moveTab', tabId: 1, groupIndex: 1 },
    ]);
  });

  it('matches duplicate URLs greedily in remote order rather than duplicating them', () => {
    const local: LocalTabRef[] = [
      { id: 1, url: 'https://dup.example' },
      { id: 2, url: 'https://dup.example' },
    ];
    const remote = [tab('https://dup.example', 0), tab('https://dup.example', 1)];

    const actions = computeReconcileActions(local, remote);

    expect(actions).toEqual([
      { type: 'moveTab', tabId: 1, groupIndex: 0 },
      { type: 'moveTab', tabId: 2, groupIndex: 1 },
    ]);
  });
});
