/**
 * What a submission targets: a standalone library problem (`practice`) or an
 * assignment problem (`assignment`, the default/legacy behavior). Drives the
 * dual-target judge pipeline (docs/REDESIGN.md §5.5).
 */
export enum SubmissionContext {
  PRACTICE = 'practice',
  ASSIGNMENT = 'assignment',
  /**
   * RESERVED by #69 and not writable. `chk_submission_single_target` allows only the
   * assignment and practice arms, so a league row is rejected by the database
   * whatever a service does. The value exists so the league can add its arm later
   * without a second type change on `submissions`.
   */
  LEAGUE = 'league',
}
