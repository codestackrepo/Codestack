/**
 * Numeric per-org limits (#66, §5.4). Values match the `org_quotas.resource` CHECK
 * — adding one means widening that CHECK in a migration, but never an ALTER TYPE.
 */
export enum QuotaResource {
  /** Seats: active members + pending invites (a pending invite holds its seat). */
  MAX_USERS = 'max_users',
  /** Org-owned problems. The platform-global catalog is charged to no org. */
  MAX_PROBLEMS = 'max_problems',
  MAX_ASSIGNMENTS = 'max_assignments',

  /**
   * Per-role seat caps (#118), set by a superadmin when an organization is approved.
   *
   * These count EXACTLY their role and nothing else, using the same
   * active-members-plus-pending-invites rule as `MAX_USERS`. So a tenant capped at
   * `max_professors: 10` may hold ten professors, however many students its
   * `max_students` allows, and any number of admins — admins are charged only to
   * `MAX_USERS`, which is what makes "professors: 10" on the approval form mean ten
   * teachers rather than ten staff.
   *
   * They are an ADDITIONAL constraint, never a replacement: every seat-creating path
   * asserts `MAX_USERS` and the role's own cap, so an org cannot exceed its total by
   * splitting the difference between roles.
   */
  MAX_PROFESSORS = 'max_professors',
  MAX_STUDENTS = 'max_students',
}

export const ALL_QUOTA_RESOURCES: QuotaResource[] = Object.values(QuotaResource);
