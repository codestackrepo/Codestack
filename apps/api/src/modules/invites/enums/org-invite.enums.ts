/**
 * Invite lifecycle. Stored as varchar + CHECK (house style — never a PG enum).
 *
 * `EXPIRED` is a STORED status, not a derived one. A partial index predicate
 * cannot contain `now()`, so deriving expiry at read time plus
 * `uq_org_invites_org_pending_email` would leave a timed-out invite forever
 * holding its address's one pending slot — permanently bricking re-invites
 * (1785530000000). Seat counting nonetheless applies
 * `status = 'pending' AND expires_at > now()`, so an unswept row never
 * over-holds a seat.
 */
export enum OrgInviteStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REVOKED = 'revoked',
  EXPIRED = 'expired',
}

/**
 * What accepting the invite does.
 *
 * `NEW_ACCOUNT` mints a fresh account at the invited role. `CLAIM` asks an
 * EXISTING, unassigned self-registrant to join the org — no bulk import ever
 * re-homes an account behind its back, so a claim is a link the invitee clicks,
 * never a write performed on their behalf.
 */
export enum OrgInviteKind {
  NEW_ACCOUNT = 'new_account',
  CLAIM = 'claim',
}

/** Whether the invite came from the single-invite form or a roster upload. */
export enum OrgInviteSource {
  MANUAL = 'manual',
  BULK = 'bulk',
  /**
   * Minted by approving an application rather than by someone choosing to invite
   * (#118) — currently an open-professor application into the community tenant.
   *
   * Recorded distinctly because provenance is the whole point of this column: these
   * invites were not sent by a member of the target organization, and filing them as
   * `manual` would make the audit trail claim a person acted who did not. DB-enforced
   * by `chk_org_invites_source`, widened in 1785640000000.
   */
  APPLICATION = 'application',
}
