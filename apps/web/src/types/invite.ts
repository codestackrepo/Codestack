import type { Role } from './common';

/** Mirrors `OrgInviteStatus` (api: invites/enums/org-invite.enums.ts). */
export const InviteStatus = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REVOKED: 'revoked',
  /** STORED, not derived — a partial index predicate cannot contain now(). */
  EXPIRED: 'expired',
} as const;
export type InviteStatus = (typeof InviteStatus)[keyof typeof InviteStatus];

/** Mirrors `OrgInviteKind`. */
export const InviteKind = {
  NEW_ACCOUNT: 'new_account',
  /** An existing unassigned account is asked to JOIN; nothing is re-homed for them. */
  CLAIM: 'claim',
} as const;
export type InviteKind = (typeof InviteKind)[keyof typeof InviteKind];

/**
 * Mirrors `InviteResponseDto` (api: invites/dto/invite.dto.ts).
 *
 * Carries NO token and no tokenHash, by design — "Copy link" is replaced by
 * "Resend", which re-mints.
 */
export interface Invite {
  id: string;
  email: string;
  role: Role;
  status: InviteStatus;
  kind: InviteKind;
  firstName: string | null;
  lastName: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  lastSentAt: string | null;
  sendCount: number;
  invitedById: string | null;
  createdAt: string;
}

/**
 * Mirrors `InvitePreviewDto` — the PUBLIC, unauthenticated view.
 *
 * When `valid` is false every identity field is null. The accept page must render
 * nothing but the status in that case, or a spent token in browser history
 * becomes a permanent disclosure oracle.
 */
export interface InvitePreview {
  valid: boolean;
  email: string | null;
  role: Role | null;
  organizationName: string | null;
  kind: InviteKind | null;
}
