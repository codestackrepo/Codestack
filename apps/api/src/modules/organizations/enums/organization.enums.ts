/**
 * Organization discriminators. Stored as varchar + CHECK (never a PG enum) to
 * match the module_access.role / notifications.type convention and avoid
 * ALTER TYPE churn as new values are added.
 */
export enum OrganizationType {
  UNIVERSITY = 'university',
  ORGANIZATION = 'organization',

  /**
   * The single platform-operated tenant that open-platform members live in (#118).
   * Exactly one row ever has this type, created by migration 1785610000000.
   *
   * It is a real `organizations` row rather than a NULL organization, and that is
   * what makes the whole open platform cheap: `chk_users_org_required` is untouched,
   * every org-scoped feature keeps working, quotas and invites need no special case,
   * and an open professor becomes representable at all (the constraint forbids an
   * org-less professor).
   *
   * The price is that this tenant's members are mutually anonymous strangers rather
   * than colleagues, so the ordinary staff surfaces would be a directory leak. Two
   * rules follow, and both are enforced rather than assumed:
   *   - `community-policy.ts` refuses the org-staff read surfaces for this type.
   *   - The UI renders plain CodeStack for it, never a co-branded lockup — this type
   *     IS the "is this an ecosystem?" test the frontend branches on.
   */
  COMMUNITY = 'community',
}

export enum OrganizationStatus {
  ACTIVE = 'active',
  /** Blocks all member logins (enforced by the TenantContextGuard, #49). */
  SUSPENDED = 'suspended',
}
