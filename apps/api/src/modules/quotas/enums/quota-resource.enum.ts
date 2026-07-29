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
}

export const ALL_QUOTA_RESOURCES: QuotaResource[] = Object.values(QuotaResource);
