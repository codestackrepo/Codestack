/**
 * Shared vocabulary for bulk roster onboarding (#106).
 *
 * Preview and commit speak exactly this, and `classifyRoster` is the only thing
 * that produces a `RosterAction` — one implementation for both phases, because
 * two would drift and the drift would only show up as a commit that does
 * something the admin did not preview.
 */

/** What the commit will do with a row. */
export enum RosterAction {
  /** Mint a `kind='new_account'` invite. Costs a seat. */
  INVITE = 'invite',
  /** Mint a `kind='claim'` invite for an existing unassigned student. Costs a seat. */
  CLAIM = 'claim',
  /** Nothing to do — already handled, or deliberately left alone. Costs nothing. */
  SKIP = 'skip',
  /** The row cannot be acted on. Costs nothing and blocks nothing. */
  ERROR = 'error',
}

/**
 * Why a row is a skip or an error.
 *
 * `NOT_AVAILABLE` is the OPAQUE collapse. For an ADMIN or PROFESSOR actor, every
 * situation they are not entitled to learn about — the address belongs to another
 * tenant, to org-less staff, or to the platform SuperAdmin — reports this single
 * code with one identical message. Discriminating them would turn a 2000-row
 * upload into a platform-wide account-state enumeration oracle.
 */
export enum RosterReason {
  DUPLICATE_IN_FILE = 'duplicate_in_file',
  ALREADY_MEMBER = 'already_member',
  ALREADY_MEMBER_INACTIVE = 'already_member_inactive',
  ACCOUNT_DISABLED = 'account_disabled',
  INVITE_ALREADY_PENDING = 'invite_already_pending',
  NOT_AVAILABLE = 'not_available',
  INVALID_EMAIL = 'invalid_email',
  MISSING_EMAIL = 'missing_email',
  MISSING_NAME = 'missing_name',
  ROLE_NOT_ALLOWED = 'role_not_allowed',
}

/** One parsed spreadsheet row, before classification. */
export interface ParsedRosterRow {
  /**
   * 1-based spreadsheet row INCLUDING the header, so the first data row is 2 —
   * the number the admin sees in Excel's gutter. Off-by-one here means every
   * error message points at the wrong line.
   */
  rowNumber: number;
  email: string;
  firstName: string;
  lastName: string;
  /** Present only when the file carried a `role` column; validated, never applied. */
  role?: string;
}

/** A row the parser could not use at all. */
export interface RosterRowError {
  rowNumber: number;
  email: string | null;
  reason: RosterReason;
  message: string;
}

export interface ParsedRoster {
  rows: ParsedRosterRow[];
  errors: RosterRowError[];
  warnings: RosterWarnings;
}

export interface RosterWarnings {
  /** Only the first worksheet is read; the rest are named here rather than dropped silently. */
  extraWorksheetsIgnored: string[];
  /** True when the file hit `maxRows` and parsing stopped. */
  truncated: boolean;
  /** Header columns that were present but are not part of the roster contract. */
  unknownColumns: string[];
}

/** A classified row — what preview shows and what commit re-derives. */
export interface ClassifiedRosterRow {
  rowNumber: number;
  email: string;
  firstName: string;
  lastName: string;
  action: RosterAction;
  reason?: RosterReason;
  message?: string;
}

/** The pre-existing state `classifyRoster` needs. Fetched in two batched queries. */
export interface RosterConflicts {
  /** Keyed by lowercase email. Only ever holds rows the ACTOR is entitled to see. */
  usersByEmail: Map<string, ConflictUser>;
  /** Lowercase emails with a pending, non-expired invite in the ACTOR's org. */
  pendingInThisOrg: Set<string>;
}

export interface ConflictUser {
  id: string;
  role: string;
  organizationId: string | null;
  isActive: boolean;
}

export interface RosterSummary {
  total: number;
  willInvite: number;
  willClaim: number;
  willSkip: number;
  errors: number;
  /** `willInvite + willClaim`. The number the quota is checked against. */
  seatsRequired: number;
}

/** What preview stages in Redis. Deliberately minimal — never the raw file. */
export interface StagedRoster {
  organizationId: string;
  createdByUserId: string;
  createdAt: string;
  rows: StagedRosterRow[];
  /**
   * Addresses skipped as `invite_already_pending`, carried so a commit with
   * `resendPending` can rotate their tokens. They are NOT in `rows` because they
   * cost no seat and insert no row — a resend re-mints the EXISTING invite.
   */
  pendingResendable: string[];
}

export interface StagedRosterRow {
  rowNumber: number;
  email: string;
  firstName: string;
  lastName: string;
  action: RosterAction.INVITE | RosterAction.CLAIM;
}
