/** Mirrors `RosterAction` (api: invites/bulk/roster.types.ts). */
export const RosterAction = {
  INVITE: 'invite',
  /** An existing unassigned account is asked to join — a materially different action. */
  CLAIM: 'claim',
  SKIP: 'skip',
  ERROR: 'error',
} as const;
export type RosterAction = (typeof RosterAction)[keyof typeof RosterAction];

/** Mirrors `RosterReason`. `not_available` is the deliberate opaque collapse. */
export type RosterReason =
  | 'duplicate_in_file'
  | 'already_member'
  | 'already_member_inactive'
  | 'account_disabled'
  | 'invite_already_pending'
  | 'not_available'
  | 'invalid_email'
  | 'missing_email'
  | 'missing_name'
  | 'role_not_allowed';

/** Mirrors `ClassifiedRosterRow`. */
export interface RosterRow {
  /** 1-based spreadsheet row INCLUDING the header, so the first data row is 2. */
  rowNumber: number;
  email: string;
  firstName: string;
  lastName: string;
  action: RosterAction;
  reason?: RosterReason;
  message?: string;
}

/** Mirrors `RosterRowError` — rows the parser could not use at all. */
export interface RosterRowError {
  rowNumber: number;
  email: string | null;
  reason: RosterReason;
  message: string;
}

/** Mirrors `RosterWarnings`. */
export interface RosterWarnings {
  extraWorksheetsIgnored: string[];
  truncated: boolean;
  unknownColumns: string[];
}

/** Mirrors `RosterSummary`. */
export interface RosterSummary {
  total: number;
  willInvite: number;
  willClaim: number;
  willSkip: number;
  errors: number;
  /** willInvite + willClaim — what the quota is checked against. */
  seatsRequired: number;
}

/**
 * Mirrors `RosterPreviewDto`.
 *
 * `stagingKey` is opaque and must be echoed back on commit, which is what makes
 * the committed row set provably the reviewed one.
 */
export interface RosterPreview {
  stagingKey: string;
  summary: RosterSummary;
  rows: RosterRow[];
  errors: RosterRowError[];
  warnings: RosterWarnings;
  /** null means UNLIMITED. Render "Unlimited", never 0. */
  seatsAvailable: number | null;
  canCommit: boolean;
}

/** Mirrors `BulkInviteResultDto`. */
export interface BulkInviteResult {
  invited: number;
  claimed: number;
  skipped: number;
  warnings: string[];
}

/**
 * Mirrors `QuotaExceededException`'s body (api: quotas/quota-exceeded.exception.ts).
 * Every number the dialog needs — no client arithmetic.
 */
export interface QuotaExceededBody {
  reason: 'quota_exceeded';
  resource: string;
  limit: number;
  current: number;
  attempted: number;
  wouldBe: number;
}
