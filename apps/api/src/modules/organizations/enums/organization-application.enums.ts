/**
 * Lifecycle of an organization's application to join the platform (#118).
 *
 * varchar + CHECK rather than a PG enum, matching every other discriminator here.
 * Terminal states are terminal: an approved application already created a tenant and
 * a rejected one is a decision on the record, so both are re-decided by submitting a
 * new application rather than by editing the old one.
 */
export enum OrgApplicationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  /**
   * The applicant no longer wants it.
   *
   * v1 has no self-serve route to this state, and that is a consequence of the table
   * being pre-account: the applicant has nothing to sign in to, so there is no
   * authenticated "cancel" they could perform. A superadmin sets it on request. The
   * future path is a tokenised cancel link in the received-mail, which is the same
   * shape every other unauthenticated action here takes.
   */
  WITHDRAWN = 'withdrawn',
}
