/** Mirrors `OrganizationType` / `OrganizationStatus` (api: organizations/enums/organization.enums.ts). */
export const OrganizationType = {
  UNIVERSITY: 'university',
  // NOT 'company' or 'other' — the CHECK constraint permits exactly these two.
  ORGANIZATION: 'organization',
} as const;
export type OrganizationType = (typeof OrganizationType)[keyof typeof OrganizationType];

export const OrganizationStatus = {
  ACTIVE: 'active',
  /** Blocks every member login — enforced server-side by TenantContextGuard. */
  SUSPENDED: 'suspended',
} as const;
export type OrganizationStatus = (typeof OrganizationStatus)[keyof typeof OrganizationStatus];

/** Mirrors `OrganizationSummaryDto` (api: organizations/dto/organization-summary.dto.ts). */
export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  type: OrganizationType;
  status: OrganizationStatus;
}

/**
 * Mirrors `PlatformOrganizationDto` (api: platform/dto/platform-organization.dto.ts).
 *
 * Note there is deliberately NO `userCount` here — the DTO does not carry one, so
 * the list cannot render a Users column without a second request per row.
 */
export interface PlatformOrganization {
  id: string;
  name: string;
  slug: string;
  type: OrganizationType;
  status: OrganizationStatus;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Mirrors `OrgCountsDto` (api: platform/dto/platform-overview.dto.ts). */
export interface OrgCounts {
  users: number;
  admins: number;
  professors: number;
  students: number;
  activeUsers: number;
  inactiveUsers: number;
  pendingInvites: number;
  classrooms: number;
  problems: number;
  assignments: number;
  submissions: number;
}

/**
 * Mirrors `QuotaUsageDto` (api: platform/dto/platform-organization-detail.dto.ts).
 *
 * `remaining` and `exceeded` are computed SERVER-side and must be consumed as
 * given. Re-deriving them here would duplicate the null-vs-0 rule — `null` means
 * unlimited, `0` means blocked — in a second place, and the copy is the one that
 * gets it wrong.
 */
export interface QuotaUsage {
  used: number;
  limit: number | null;
  remaining: number | null;
  exceeded: boolean;
}

/** Mirrors `OrgQuotaUsageDto`. Keyed by concept, not by the org_quotas resource string. */
export interface OrgQuotaUsage {
  users: QuotaUsage;
  problems: QuotaUsage;
  assignments: QuotaUsage;
}

/** Mirrors `PlatformOrganizationDetailDto` — the list row plus census and usage. */
export interface PlatformOrganizationDetail extends PlatformOrganization {
  counts: OrgCounts;
  usage: OrgQuotaUsage;
}

/** Mirrors `PlatformUnassignedDto` (api: platform/dto/platform-overview.dto.ts). */
export interface PlatformUnassigned {
  students: number;
  activeStudents: number;
  inactiveStudents: number;
  /** Org-less staff. The DB CHECK forbids these, so non-zero is an integrity alarm. */
  orphanedStaff: number;
  activeOrphanedStaff: number;
  inactiveOrphanedStaff: number;
}
