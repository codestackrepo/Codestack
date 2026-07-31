import { apiClient } from '@/lib/api-client';
import type { PaginatedResult, Role } from '@/types/common';
import type {
  OrganizationType,
  PlatformOrganization,
  PlatformOrganizationDetail,
} from '@/types/organization';
import type { Invite } from '@/types/invite';
import type { AccessKey, OrgMatrix, OrgQuotas, QuotaResource } from '@/types/entitlement';
import type { User } from '@/types/user';

export interface CreateOrganizationInput {
  name: string;
  slug?: string;
  type?: OrganizationType;
}

/**
 * SuperAdmin platform surface. Every route is `@Platform()`-gated, which requires
 * `organizationId === null` — so each one names its target org explicitly rather
 * than deriving it from the actor, who has none.
 */
export const platformApi = {
  async listOrganizations(): Promise<PlatformOrganization[]> {
    const { data } = await apiClient.get<PlatformOrganization[]>('/platform/organizations');
    return data;
  },

  async getOrganization(id: string): Promise<PlatformOrganizationDetail> {
    const { data } = await apiClient.get<PlatformOrganizationDetail>(
      `/platform/organizations/${id}`,
    );
    return data;
  },

  async createOrganization(input: CreateOrganizationInput): Promise<PlatformOrganization> {
    const { data } = await apiClient.post<PlatformOrganization>('/platform/organizations', input);
    return data;
  },

  async suspendOrganization(id: string): Promise<PlatformOrganization> {
    const { data } = await apiClient.post<PlatformOrganization>(
      `/platform/organizations/${id}/suspend`,
    );
    return data;
  },

  async activateOrganization(id: string): Promise<PlatformOrganization> {
    const { data } = await apiClient.post<PlatformOrganization>(
      `/platform/organizations/${id}/activate`,
    );
    return data;
  },

  /** One org's members. Scoped by `overrideOrgId`, readable only inside the SuperAdmin branch. */
  async listOrgUsers(
    orgId: string,
    params: { page?: number; q?: string } = {},
  ): Promise<PaginatedResult<User>> {
    const { data } = await apiClient.get<PaginatedResult<User>>(
      `/platform/organizations/${orgId}/users`,
      { params: { page: 1, limit: 20, ...params } },
    );
    return data;
  },

  async listOrgInvites(orgId: string, params: { page?: number } = {}) {
    const { data } = await apiClient.get<PaginatedResult<Invite>>(
      `/platform/organizations/${orgId}/invites`,
      { params: { page: 1, limit: 20, ...params } },
    );
    return data;
  },

  /** A SuperAdmin is the only actor who may invite an ADMIN or PROFESSOR. */
  async inviteToOrg(
    orgId: string,
    input: { email: string; role: Role; firstName?: string; lastName?: string },
  ): Promise<Invite> {
    const { data } = await apiClient.post<Invite>(
      `/platform/organizations/${orgId}/invites`,
      input,
    );
    return data;
  },

  /** The platform-wide unassigned pool. */
  async listUnassigned(params: { page?: number; q?: string } = {}): Promise<PaginatedResult<User>> {
    const { data } = await apiClient.get<PaginatedResult<User>>('/platform/users/unassigned', {
      params: { page: 1, limit: 20, ...params },
    });
    return data;
  },

  /** Places an unassigned student into ANY org, optionally above student rank. */
  async assignUser(userId: string, input: { organizationId: string; role?: Role }): Promise<User> {
    const { data } = await apiClient.post<User>(
      `/platform/users/${userId}/assign-organization`,
      input,
    );
    return data;
  },

  // ---- #70: per-org entitlement + quota administration ----

  async getOrgMatrix(orgId: string): Promise<OrgMatrix> {
    const { data } = await apiClient.get<OrgMatrix>(
      `/platform/organizations/${orgId}/module-access`,
    );
    return data;
  },

  /** Returns the REFRESHED matrix, so the caller renders the server's answer. */
  async setOrgMatrixCell(
    orgId: string,
    key: AccessKey,
    role: Role,
    enabled: boolean,
  ): Promise<OrgMatrix> {
    const { data } = await apiClient.patch<OrgMatrix>(
      `/platform/organizations/${orgId}/module-access`,
      { key, role, enabled },
    );
    return data;
  },

  async getOrgQuotas(orgId: string): Promise<OrgQuotas> {
    const { data } = await apiClient.get<OrgQuotas>(`/platform/organizations/${orgId}/quotas`);
    return data;
  },

  /**
   * `limitValue` is `number | null` and is ALWAYS sent. `null` means UNLIMITED, `0`
   * means BLOCKED, and they are not interchangeable — the server rejects an absent
   * field rather than guessing which was meant, so never omit it.
   */
  async setOrgQuota(
    orgId: string,
    resource: QuotaResource,
    limitValue: number | null,
  ): Promise<OrgQuotas> {
    const { data } = await apiClient.patch<OrgQuotas>(`/platform/organizations/${orgId}/quotas`, {
      resource,
      limitValue,
    });
    return data;
  },
};

/**
 * Keys with the filter object LAST, so a prefix invalidation clears every
 * permutation — the shape `use-notifications.ts` already uses.
 */
export const platformKeys = {
  all: ['platform'] as const,
  organizations: () => [...platformKeys.all, 'organizations'] as const,
  organization: (id: string) => [...platformKeys.organizations(), id] as const,
  orgUsers: (id: string, params: object) =>
    [...platformKeys.organization(id), 'users', params] as const,
  orgInvites: (id: string, params: object) =>
    [...platformKeys.organization(id), 'invites', params] as const,
  unassigned: (params: object = {}) => [...platformKeys.all, 'unassigned', params] as const,
  orgMatrix: (id: string) => [...platformKeys.organization(id), 'module-access'] as const,
  orgQuotas: (id: string) => [...platformKeys.organization(id), 'quotas'] as const,
};
