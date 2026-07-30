/**
 * User-administration domain events (#105).
 *
 * Emitted by UsersService AFTER its transaction commits, and handled by
 * NotificationsListener, which fans them out to a notification and a mail. The
 * indirection is the same one SUBMISSION_FINALIZED uses: UsersService must not
 * depend on MailService or NotificationsService, or every user write would drag
 * the mail queue into its dependency graph and its tests.
 *
 * Access events are emitted only on a REAL transition. `setAccess` is idempotent,
 * so revoking an already-revoked account is a no-op: no event, and therefore no
 * second "your access was removed" mail to someone who got one last week.
 */
export const USER_ACCESS_REVOKED = 'user.access-revoked';
export const USER_ACCESS_GRANTED = 'user.access-granted';
export const USER_ORGANIZATION_ASSIGNED = 'user.organization-assigned';

export interface UserAccessChangedEvent {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  /** The staff member who flipped it. Never named in the mail — see the templates. */
  actorId: string;
}

export interface UserOrganizationAssignedEvent {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  organizationId: string;
  organizationName: string;
  actorId: string;
}
