/**
 * How an item is graded: `auto` (MCQ — scored server-side on submit) or
 * `manual` (coding + quiz — a professor assigns the score).
 */
export enum AssignmentItemGradingMode {
  AUTO = 'auto',
  MANUAL = 'manual',
}
