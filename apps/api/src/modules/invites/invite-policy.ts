import { ForbiddenException } from '@nestjs/common';
import { Role } from '../../common/enums/role.enum';

/**
 * Who may invite whom.
 *
 * This matrix — not the `@Roles` decorator — is what actually stops
 * `POST /invites {"role":"admin"}`. `RolesGuard` is MINIMUM-RANK
 * (`roles.guard.ts`: `ROLE_RANK[user.role] >= minRank`), so `@Roles(PROFESSOR)`
 * admits an ADMIN and a SUPERADMIN too. And `@IsEnum(Role)` on the DTO accepts
 * every role name including `superadmin`. So the decorator gates the ROUTE and
 * this gates the REQUESTED ROLE, and only the second one is a privilege boundary.
 *
 * `superadmin` appears in no value, which is the point: it is not invitable by
 * anyone, at any tier, and the DB backstops that with `chk_org_invites_role`.
 *
 * AN ADMIN MAY NOW INVITE A PROFESSOR (#118), and this reverses a previous rule.
 *
 * The old rule was `ADMIN -> [STUDENT]` only, on the reasoning that staff onboarding
 * was a SuperAdmin operation so a compromised org admin could not manufacture
 * teaching staff. That reasoning belonged to a platform where CodeStack created every
 * tenant by hand. Organizations now apply for themselves and a superadmin approves
 * them WITH per-role seat caps, after which the tenant runs its own roster — an
 * arrangement where routing every professor through CodeStack support is not a
 * security control, it is a queue nobody can staff.
 *
 * What replaces that control, because "we removed it" is not an answer:
 *
 *  1. PER-ROLE SEAT CAPS (`MAX_PROFESSORS`). The superadmin sets, at approval, how
 *     many professors a tenant may ever hold. A compromised admin cannot mint the
 *     eleventh professor in a ten-professor org, so the blast radius is a number a
 *     human chose rather than unbounded. This is strictly stronger than the old rule
 *     on the dimension that mattered: the old one bounded WHO could add staff, this
 *     one bounds HOW MANY exist.
 *  2. TENANCY. An invited professor is confined to that organization — they cannot
 *     read another tenant, and `user-role.policy` still forbids anyone minting a role
 *     at or above their own, so an admin cannot manufacture a second admin.
 *  3. AUDIT. Every invite records `invited_by_id`, so who added which professor is
 *     answerable after the fact.
 *
 * The caps must therefore SHIP WITH OR BEFORE this matrix. A release with the flip and
 * without `MAX_PROFESSORS` would have neither the old control nor the new one.
 *
 * `professor_requests` keeps its purpose despite this: invites are addressed to an
 * ADDRESS, and an existing same-org member who receives one gets `already_member`
 * with no role change. Promoting a student who is already inside the tenant still
 * goes through that request flow, or through `PATCH /users` — both of which are now
 * seat-capped too.
 */
export const INVITABLE_ROLES: Readonly<Record<Role, readonly Role[]>> = Object.freeze({
  [Role.SUPERADMIN]: Object.freeze([Role.ADMIN, Role.PROFESSOR, Role.STUDENT]),
  [Role.ADMIN]: Object.freeze([Role.PROFESSOR, Role.STUDENT]),
  [Role.PROFESSOR]: Object.freeze([Role.STUDENT]),
  [Role.STUDENT]: Object.freeze([]),
});

/** Whether `actorRole` may mint an invite for `targetRole`. */
export function mayInvite(actorRole: Role, targetRole: Role): boolean {
  return INVITABLE_ROLES[actorRole].includes(targetRole);
}

/** Throws 403 `role_not_invitable` unless the matrix permits it. */
export function assertMayInvite(actorRole: Role, targetRole: Role): void {
  if (!mayInvite(actorRole, targetRole)) {
    throw new ForbiddenException({
      reason: 'role_not_invitable',
      message: `A ${actorRole} may not invite a ${targetRole}`,
    });
  }
}
