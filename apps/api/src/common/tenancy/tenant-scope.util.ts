import { ForbiddenException } from '@nestjs/common';
import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { Role } from '../enums/role.enum';
import { AuthenticatedUser } from '../types/authenticated-user';

/**
 * Shared tenant-scoping primitives (#49). There is no RLS and no base
 * repository — every service hand-builds a QueryBuilder — so these are the
 * single choke points every read/count/member-write seam must call (#50) to
 * keep one tenant's data out of another's.
 *
 * IMPORTANT: the SuperAdmin bypass is gated on the role flag, NEVER on
 * `organizationId === null`. A mis-provisioned non-superadmin with a null org
 * must NOT silently see everything — it filters to `org = NULL` (matches
 * nothing) rather than bypassing.
 */
export const isSuperAdmin = (actor: AuthenticatedUser): boolean => actor.role === Role.SUPERADMIN;

export interface ScopeOpts {
  /** Column on `alias` holding the org id. Defaults to `organizationId`. */
  column?: string;
  /** Also match `<col> IS NULL` — e.g. platform-global problems visible to all orgs. */
  includeGlobal?: boolean;
  /** SuperAdmin console: narrow a cross-org screen down to one org. */
  overrideOrgId?: string;
}

/**
 * Appends the tenant predicate to `qb`. SuperAdmin is unfiltered (optionally
 * narrowed by `overrideOrgId`); everyone else is bounded to their own org
 * (optionally unioned with global rows). Uses namespaced params so it never
 * clobbers a caller's existing `andWhere` bindings.
 */
export function scopeToOrg<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  actor: AuthenticatedUser,
  opts: ScopeOpts = {},
): SelectQueryBuilder<T> {
  const col = `${alias}.${opts.column ?? 'organizationId'}`;
  if (isSuperAdmin(actor)) {
    if (opts.overrideOrgId) {
      qb.andWhere(`${col} = :__scopeOverrideOrg`, { __scopeOverrideOrg: opts.overrideOrgId });
    }
    return qb;
  }
  if (opts.includeGlobal) {
    qb.andWhere(`(${col} = :__scopeActorOrg OR ${col} IS NULL)`, {
      __scopeActorOrg: actor.organizationId,
    });
  } else {
    qb.andWhere(`${col} = :__scopeActorOrg`, { __scopeActorOrg: actor.organizationId });
  }
  return qb;
}

/**
 * Write-time cross-org guard for member/professor/batch pickers etc. Rejects a
 * reference to a row in another org (closes cross-tenant IDOR). SuperAdmin is
 * exempt (cross-org by design).
 */
export function assertSameOrg(actor: AuthenticatedUser, targetOrgId: string | null): void {
  if (isSuperAdmin(actor)) return;
  if (targetOrgId !== actor.organizationId) {
    throw new ForbiddenException({
      reason: 'cross_org',
      message: 'Cross-organization reference is not allowed',
    });
  }
}
