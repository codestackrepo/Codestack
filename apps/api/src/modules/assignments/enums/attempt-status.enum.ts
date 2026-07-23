/**
 * Lifecycle of a student's timed-test attempt. `auto_submitted` is set by the
 * deadline-enforcement hardening (issue #39) when the server closes an attempt
 * past its deadline.
 */
export enum AttemptStatus {
  IN_PROGRESS = 'in_progress',
  SUBMITTED = 'submitted',
  AUTO_SUBMITTED = 'auto_submitted',
}
