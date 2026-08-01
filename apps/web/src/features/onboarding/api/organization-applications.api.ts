import { apiClient } from '@/lib/api-client';
import type { PaginatedResult } from '@/types/common';
import type { OrganizationType } from '@/types/organization';

/** Mirrors `OrgApplicationStatus` (api: organizations/enums/organization-application.enums.ts). */
export const OrgApplicationStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn',
} as const;
export type OrgApplicationStatus = (typeof OrgApplicationStatus)[keyof typeof OrgApplicationStatus];

/** Mirrors `CreateOrganizationApplicationDto`. */
export interface SubmitOrgApplicationInput {
  organizationName: string;
  organizationType?: OrganizationType;
  website?: string;
  contactName: string;
  contactEmail: string;
  message?: string;
}

/** Mirrors `OrganizationApplicationDto`. */
export interface OrgApplication {
  id: string;
  organizationName: string;
  organizationType: OrganizationType;
  website: string | null;
  contactName: string;
  contactEmail: string;
  message: string;
  status: OrgApplicationStatus;
  reviewedById: string | null;
  reviewedAt: string | null;
  decisionReason: string;
  organizationId: string | null;
  createdAt: string;
}

/**
 * Mirrors `ApproveOrganizationApplicationDto`. Every cap except `maxUsers` is
 * REQUIRED — an org must not be created unlimited by default on any resource.
 */
export interface ApproveOrgApplicationInput {
  adminEmail: string;
  maxProfessors: number;
  maxStudents: number;
  maxProblems: number;
  maxAssignments: number;
  /** Absent = no overall cap, bounded by the per-role seat caps alone. */
  maxUsers?: number;
}

export const orgApplicationKeys = {
  list: (status?: OrgApplicationStatus) =>
    ['platform', 'org-applications', status ?? 'all'] as const,
};

export const orgApplicationsApi = {
  /**
   * Public. Answers one fixed 202 whatever happened — a pending application for the
   * address, a concurrent duplicate, or a fresh row are indistinguishable — so there is
   * nothing to branch on and the only correct UI is an acknowledgement.
   */
  async submit(input: SubmitOrgApplicationInput): Promise<{ message: string }> {
    const { data } = await apiClient.post<{ message: string }>('/organization-applications', input);
    return data;
  },

  async list(status?: OrgApplicationStatus): Promise<PaginatedResult<OrgApplication>> {
    const { data } = await apiClient.get<PaginatedResult<OrgApplication>>(
      '/platform/organization-applications',
      { params: status ? { status } : undefined },
    );
    return data;
  },

  /**
   * Creates the tenant with its seat caps, then invites the administrator.
   *
   * Can fail with `org_created_invite_failed` AFTER the organization exists — the two
   * steps are not one transaction. That reason means "the org is real, send the invite
   * by hand", never "approve again", so the caller must surface it rather than offering
   * a retry.
   */
  async approve(id: string, input: ApproveOrgApplicationInput): Promise<OrgApplication> {
    const { data } = await apiClient.post<OrgApplication>(
      `/platform/organization-applications/${id}/approve`,
      input,
    );
    return data;
  },

  async reject(id: string, reason?: string): Promise<OrgApplication> {
    const { data } = await apiClient.post<OrgApplication>(
      `/platform/organization-applications/${id}/reject`,
      { reason },
    );
    return data;
  },
};
