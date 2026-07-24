/**
 * Organization discriminators. Stored as varchar + CHECK (never a PG enum) to
 * match the module_access.role / notifications.type convention and avoid
 * ALTER TYPE churn as new values are added.
 */
export enum OrganizationType {
  UNIVERSITY = 'university',
  ORGANIZATION = 'organization',
}

export enum OrganizationStatus {
  ACTIVE = 'active',
  /** Blocks all member logins (enforced by the TenantContextGuard, #49). */
  SUSPENDED = 'suspended',
}
