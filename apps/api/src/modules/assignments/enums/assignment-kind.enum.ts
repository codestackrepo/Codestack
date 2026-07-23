/**
 * Whether an assignment is a regular (untimed) assignment or a timed test.
 * A "test" is not a separate entity — it reuses the Assignment state machine
 * (startDate/endDate + applyTimeTransition) plus `durationMinutes` and the
 * server-authoritative AssignmentAttempt deadline (see docs/REDESIGN.md §5.2).
 */
export enum AssignmentKind {
  ASSIGNMENT = 'assignment',
  TEST = 'test',
}
