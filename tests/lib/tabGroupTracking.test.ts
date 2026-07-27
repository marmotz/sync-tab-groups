import { describe, expect, it } from 'vitest';
import { resolveTabGroupChange } from '../../src/lib/tabGroupTracking';

describe('resolveTabGroupChange', () => {
  it('records and reports the group a tab just joined', () => {
    const tracker = new Map<number, number>();
    const result = resolveTabGroupChange(1, 7, tracker);

    expect(result).toEqual({ joined: 7 });
    expect(tracker.get(1)).toBe(7);
  });

  it('reports the previous group when a tracked tab leaves its group (groupId -1)', () => {
    const tracker = new Map<number, number>([[1, 7]]);
    const result = resolveTabGroupChange(1, -1, tracker);

    expect(result).toEqual({ left: 7 });
    expect(tracker.has(1)).toBe(false);
  });

  it('reports the previous group when a tracked tab is removed (groupId undefined)', () => {
    const tracker = new Map<number, number>([[1, 7]]);
    const result = resolveTabGroupChange(1, undefined, tracker);

    expect(result).toEqual({ left: 7 });
    expect(tracker.has(1)).toBe(false);
  });

  it('reports nothing for an untracked tab leaving no group', () => {
    const tracker = new Map<number, number>();
    const result = resolveTabGroupChange(1, -1, tracker);

    expect(result).toEqual({});
    expect(tracker.size).toBe(0);
  });

  it('reports nothing when the tab id is unknown and the tab is not joining a group', () => {
    const tracker = new Map<number, number>();
    expect(resolveTabGroupChange(undefined, undefined, tracker)).toEqual({});
    expect(resolveTabGroupChange(undefined, -1, tracker)).toEqual({});
  });

  it('still reports a group join without a tab id, but has nothing to track', () => {
    const tracker = new Map<number, number>();
    expect(resolveTabGroupChange(undefined, 7, tracker)).toEqual({ joined: 7 });
    expect(tracker.size).toBe(0);
  });

  it('moving a tab directly from one group to another reports both the join and the leave', () => {
    const tracker = new Map<number, number>([[1, 7]]);
    const result = resolveTabGroupChange(1, 9, tracker);

    expect(result).toEqual({ joined: 9, left: 7 });
    expect(tracker.get(1)).toBe(9);
  });

  it('re-reporting the same group is a no-op join with no leave', () => {
    const tracker = new Map<number, number>([[1, 7]]);
    const result = resolveTabGroupChange(1, 7, tracker);

    expect(result).toEqual({ joined: 7 });
    expect(tracker.get(1)).toBe(7);
  });
});
