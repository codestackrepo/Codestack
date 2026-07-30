import { ForbiddenException } from '@nestjs/common';
import { Role, ROLE_RANK, roleAtLeast } from '../../common/enums/role.enum';

/**
 * Roles a user-administration endpoint may ever be asked to assign. Exists ONLY
 * as the `@IsIn` allowlist on the DTOs — it is a shape check, not an
 * authorization one. `assertAssignableRole` is the boundary.
 */
export const ASSIGNABLE_ROLES: readonly Role[] = Object.freeze([
  Role.ADMIN,
  Role.PROFESSOR,
  Role.STUDENT,
]);

/**
 * Whether `actor` may set a user's role to `role`.
 *
 * Two rules, and the first is absolute:
 *
 *  1. SUPERADMIN is NEVER assignable, by anyone, through any endpoint. It is
 *     minted exclusively by `seed:superadmin`. Before this existed,
 *     `POST /users {"role":"superadmin"}` and `PATCH /users/:id` both honoured it
 *     for any ADMIN actor, and the new SuperAdmin inherited every `isSuperAdmin()`
 *     bypass in tenant-scope.util — an org admin could read and write every
 *     tenant on the platform.
 *  2. Nobody may assign a role ranked at or above their own. An ADMIN cannot mint
 *     another ADMIN, a PROFESSOR cannot mint a PROFESSOR. Otherwise a single
 *     compromised account propagates its own level sideways without limit.
 *
 * A SUPERADMIN actor is exempt from rule 2 only — rule 1 still binds, which is
 * what stops even the platform operator from creating a second one by accident
 * (and what makes `chk_users_org_required`'s CASE arm reachable only via the
 * seed).
 */
export function mayAssignRole(actor: { role: Role }, role: Role): boolean {
  if (role === Role.SUPERADMIN) return false;
  if (actor.role === Role.SUPERADMIN) return true;
  return !roleAtLeast(role, actor.role);
}

/** Throws 403 `role_not_assignable` unless the actor may assign `role`. */
export function assertAssignableRole(actor: { role: Role }, role: Role): void {
  if (!mayAssignRole(actor, role)) {
    throw new ForbiddenException({
      reason: 'role_not_assignable',
      message:
        role === Role.SUPERADMIN
          ? 'The superadmin role cannot be assigned through the API'
          : `A ${actor.role} may not assign the ${role} role`,
    });
  }
}

/**
 * Whether `actor` may flip `target`'s access.
 *
 * Ordered deliberately: self first (so a SuperAdmin cannot lock themselves out
 * either), then the SuperAdmin bypass, then same-org, then rank.
 */
export function assertCanToggleAccess(
  actor: { id: string; role: Role; organizationId: string | null },
  target: { id: string; role: Role },
  assertSameOrgFn: () => void,
): void {
  // Applies to EVERY role including SUPERADMIN. Revoking your own access is not
  // recoverable from inside the app, and it is the one mistake that has no undo.
  if (actor.id === target.id) {
    throw new ForbiddenException({
      reason: 'cannot_revoke_self',
      message: 'You cannot change your own access',
    });
  }
  if (actor.role === Role.SUPERADMIN) return;

  assertSameOrgFn();

  if (actor.role === Role.ADMIN) {
    // An admin governs their whole tenant, but not a peer admin — that would let
    // two admins disable each other.
    if (ROLE_RANK[target.role] >= ROLE_RANK[Role.ADMIN]) {
      throw new ForbiddenException({
        reason: 'insufficient_rank',
        message: 'You cannot change access for another administrator',
      });
    }
    return;
  }
  if (actor.role === Role.PROFESSOR && target.role === Role.STUDENT) return;

  throw new ForbiddenException({
    reason: 'insufficient_rank',
    message: 'You cannot change access for this user',
  });
}
