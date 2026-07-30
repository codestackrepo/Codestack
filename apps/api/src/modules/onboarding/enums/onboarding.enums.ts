/**
 * Professor-ACCESS-REQUEST status. Stored as a varchar column (not a PG enum) so
 * new states are code-only additions, matching the project's newer convention.
 *
 * `InviteStatus` used to live here. Professor invites were retired with the
 * `professor_invites` table (#104) — invitations are now `org_invites`, which
 * carry their own `OrgInviteStatus`, an organization_id and a hashed token.
 * Requests survive because they are the escape hatch for promoting someone who
 * is ALREADY in an org, which no invite expresses.
 */
export enum RequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}
