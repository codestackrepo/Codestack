/**
 * What a submission targets: a standalone library problem (`practice`) or an
 * assignment problem (`assignment`, the default/legacy behavior). Drives the
 * dual-target judge pipeline (docs/REDESIGN.md §5.5).
 */
export enum SubmissionContext {
  PRACTICE = 'practice',
  ASSIGNMENT = 'assignment',
}
