import {
  adoptLocalOverSynced,
  adoptSyncedOverLocal,
  mergeLocalAndSynced,
  openGroup,
  renameLocalGroupToAvoidConflict,
  type SyncedGroupInfo,
} from '../lib/groupActions';

export type MergeChoice = 'renameLocal' | 'keepLocal' | 'keepCloud' | 'merge';

/**
 * Maps a user choice in the same-name conflict area to the matching lib primitive.
 * Kept separate from the DOM wiring so the choice-to-action mapping stays unit-testable.
 */
export function runMergeChoice(
  choice: MergeChoice,
  info: SyncedGroupInfo,
  targetLocalGroupId: number,
): Promise<void> {
  switch (choice) {
    case 'renameLocal':
      return renameLocalGroupToAvoidConflict(targetLocalGroupId, info.group.title).then(() =>
        openGroup(info.syncId, info.group),
      );
    case 'keepLocal':
      return adoptLocalOverSynced(info.syncId, targetLocalGroupId);
    case 'keepCloud':
      return adoptSyncedOverLocal(info.syncId, targetLocalGroupId, info.group);
    case 'merge':
      return mergeLocalAndSynced(info.syncId, targetLocalGroupId, info.group);
  }
}
