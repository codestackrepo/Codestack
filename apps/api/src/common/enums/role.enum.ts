/**
 * User roles. NOTE: "grader" is intentionally NOT a role — in the domain a
 * grader is a `student`-role user placed in a classroom's graders set.
 *
 * SUPERADMIN is the platform-level, cross-org, org-less role that sits above the
 * per-org ADMIN. It is the ONLY unconditional bypass in the RBAC + module-access
 * guards (admin is bounded to its own org once multi-tenancy lands).
 */
export enum Role {
  SUPERADMIN = 'superadmin',
  ADMIN = 'admin',
  PROFESSOR = 'professor',
  STUDENT = 'student',
}

/**
 * Per-ORG staff. SUPERADMIN is DELIBERATELY excluded — this constant scopes
 * intra-org member pickers / visibility, and a superadmin must never appear as
 * selectable org staff.
 */
export const STAFF_ROLES: Role[] = [Role.ADMIN, Role.PROFESSOR];

/**
 * Role hierarchy. Replaces the hardcoded `role === Role.ADMIN` bypasses: a
 * `@Roles(...)` gate passes when the actor's rank ≥ the lowest required rank
 * (so SUPERADMIN passes everything, ADMIN passes everything below it). All
 * existing gates are `@Roles(ADMIN)` / `@Roles(ADMIN, PROFESSOR)`, so this is
 * behaviour-preserving; there is no `@Roles(STUDENT)`-exclusive route.
 */
export const ROLE_RANK: Record<Role, number> = {
  [Role.SUPERADMIN]: 3,
  [Role.ADMIN]: 2,
  [Role.PROFESSOR]: 1,
  [Role.STUDENT]: 0,
};

/** True when `actor` outranks or equals `min` in the role hierarchy. */
export const roleAtLeast = (actor: Role, min: Role): boolean => ROLE_RANK[actor] >= ROLE_RANK[min];
