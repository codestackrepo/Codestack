/**
 * Onboarding status enums. Stored as varchar columns (not PG enums) so new
 * states are code-only additions — no ALTER TYPE migration, matching the
 * project's newer convention (see notifications.type).
 */
export enum InviteStatus {
  /** Minted, not yet used, not revoked. Still subject to `expiresAt`. */
  PENDING = 'pending',
  /** A registrant consumed it to become a professor. */
  CONSUMED = 'consumed',
  /** An admin cancelled it before use. */
  REVOKED = 'revoked',
}

export enum RequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}
