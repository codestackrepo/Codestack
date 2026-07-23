/**
 * Who an assignment is visible to within its classroom: everyone
 * (`classroom`) or only members of the linked batches (`batch`). Enforced for
 * students only — staff and graders always see every assignment (§9.10).
 */
export enum AssignmentTargetType {
  CLASSROOM = 'classroom',
  BATCH = 'batch',
}
