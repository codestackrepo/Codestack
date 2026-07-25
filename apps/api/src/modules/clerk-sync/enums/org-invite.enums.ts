/**
 * Local lifecycle of a mirrored Clerk Organization Invitation. Stored as
 * varchar + CHECK (house style — never a PG enum). Only `pending` invites count
 * against a seat quota (#65/#66).
 */
export enum OrgInviteStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REVOKED = 'revoked',
}
