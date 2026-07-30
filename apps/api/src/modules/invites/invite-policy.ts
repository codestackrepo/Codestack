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
 * An ADMIN may not invite a PROFESSOR. That is deliberate, not an oversight —
 * staff onboarding is a SuperAdmin operation, so a compromised or careless org
 * admin cannot manufacture teaching staff inside their tenant. The escape hatch
 * for promoting someone already in the org is `professor_requests`, which an
 * admin approves.
 */
export const INVITABLE_ROLES: Readonly<Record<Role, readonly Role[]>> = Object.freeze({
  [Role.SUPERADMIN]: Object.freeze([Role.ADMIN, Role.PROFESSOR, Role.STUDENT]),
  [Role.ADMIN]: Object.freeze([Role.STUDENT]),
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
