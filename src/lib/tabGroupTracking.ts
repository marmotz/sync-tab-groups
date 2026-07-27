export interface TabGroupChange {
  /** Group the tab now belongs to, if any. */
  joined?: number;
  /** Group the tab no longer belongs to, if any (left, closed, or moved away). */
  left?: number;
}

/**
 * Firefox doesn't report a tab's previous group when it leaves one — a drag-out sets
 * `groupId` to -1, a close carries no groupId at all, and moving a tab directly from
 * one group to another only reports the new groupId. This tracker remembers each
 * tab's last known group so callers can still resync whichever group was just left,
 * even when a single event silently covers both a join and a leave.
 */
export function resolveTabGroupChange(
  tabId: number | undefined,
  groupId: number | undefined,
  tracker: Map<number, number>,
): TabGroupChange {
  const previousGroupId = tabId !== undefined ? tracker.get(tabId) : undefined;

  if (groupId !== undefined && groupId !== -1) {
    if (tabId !== undefined) {
      tracker.set(tabId, groupId);
    }
    if (previousGroupId !== undefined && previousGroupId !== groupId) {
      return { joined: groupId, left: previousGroupId };
    }
    return { joined: groupId };
  }

  if (tabId === undefined || previousGroupId === undefined) {
    return {};
  }

  tracker.delete(tabId);
  return { left: previousGroupId };
}
