import { Role } from '../../common/enums/role.enum';
import { OrgInviteStatus } from '../invites/enums/org-invite.enums';
import { QuotaResource } from './enums/quota-resource.enum';

/**
 * ONE definition of "what occupies a seat", in the two dialects that need it.
 *
 * The rule: a seat is held by an ACTIVE member, or by a PENDING invite that has not
 * yet expired. Reserving at invite time is what makes acceptance net-zero
 * (invite pending→accepted −1, user +1), so an org cannot be oversubscribed just by
 * minting invites. The `expires_at > now()` term is load-bearing because `expired` is
 * a STORED status flipped lazily (1785530000000): a timed-out invite can sit as
 * `pending` indefinitely, and without that term it would hold its seat forever.
 *
 * WHY TWO RENDERINGS. `QuotaService` counts with raw SQL (it must run inside the
 * caller's transaction and see uncommitted rows), while `PlatformMetricsService`
 * counts with a TypeORM QueryBuilder (it group-bys across every org). Raw SQL needs
 * column names, the builder needs entity property names, so a single string cannot
 * serve both. Keeping them adjacent in one file — rather than as a comment in each
 * service asking the next reader to keep them in step — is what makes a divergence
 * obvious: the two functions are three lines apart.
 *
 * If they DO diverge, the symptom is nasty and quiet: the platform console reports an
 * organization has room while enforcement 409s it, or the reverse.
 */

/** Raw-SQL rendering, column names. Status is inlined from the enum, not a parameter,
 *  so callers with differing parameter positions can all use it verbatim. */
export const PENDING_INVITE_HOLDS_SEAT_SQL = `status = '${OrgInviteStatus.PENDING}' AND expires_at > now()`;

/** Raw-SQL rendering of "this member occupies a seat". */
export const ACTIVE_MEMBER_HOLDS_SEAT_SQL = `is_active = true`;

/** QueryBuilder rendering of the same invite rule, for an aliased `org_invites`. */
export function pendingInviteHoldsSeatQb(alias: string): string {
  return `${alias}.status = '${OrgInviteStatus.PENDING}' AND ${alias}.expiresAt > now()`;
}

/**
 * Which per-role seat cap a role is charged to, or null for roles that have none.
 *
 * Centralised so no call site hand-picks the enum member — there are seven places
 * that create or convert a seat, and a wrong constant at any one of them is a cap
 * that silently does not apply.
 *
 * SUPERADMIN is null because it is org-less by construction (`chk_users_org_required`
 * forbids an org-carrying superadmin), so it can never occupy a tenant's seat.
 *
 * ADMIN is null by DECISION, not by omission (#118). Admins count against `MAX_USERS`
 * only. The alternative — folding them into `MAX_PROFESSORS` as "staff" — would make
 * the superadmin's approval form lie: a field labelled "professors: 10" would silently
 * mean "professors and admins combined", so onboarding three admins would cost three
 * teaching seats. If a combined staff cap is ever wanted, it belongs as its own
 * resource rather than by overloading this one.
 */
export function seatResourceFor(role: Role): QuotaResource | null {
  switch (role) {
    case Role.PROFESSOR:
      return QuotaResource.MAX_PROFESSORS;
    case Role.STUDENT:
      return QuotaResource.MAX_STUDENTS;
    case Role.ADMIN:
    case Role.SUPERADMIN:
      return null;
  }
}

/** The inverse: which role a per-role cap counts. Null for the non-role resources. */
export function roleForSeatResource(resource: QuotaResource): Role | null {
  switch (resource) {
    case QuotaResource.MAX_PROFESSORS:
      return Role.PROFESSOR;
    case QuotaResource.MAX_STUDENTS:
      return Role.STUDENT;
    default:
      return null;
  }
}
