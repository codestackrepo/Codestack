import { apiClient } from '@/lib/api-client';
import type { PaginatedResult } from '@/types/common';
import type { Invite, InvitePreview, InviteStatus } from '@/types/invite';
import type { Role } from '@/types/common';

export interface CreateInviteInput {
  email: string;
  role: Role;
  firstName?: string;
  lastName?: string;
  expiresInDays?: number;
}

export interface ListInvitesParams {
  page?: number;
  limit?: number;
  status?: InviteStatus;
  role?: Role;
}

/**
 * Org-scoped invite surface. No method takes an organization — the tenant is the
 * actor's, server-side, and a body field naming one is a 400.
 */
export const invitesApi = {
  /** PUBLIC. Answers 200 even for a bogus token; check `valid`. */
  async preview(token: string): Promise<InvitePreview> {
    const { data } = await apiClient.get<InvitePreview>(
      `/invites/${encodeURIComponent(token)}/preview`,
    );
    return data;
  },

  async list(params: ListInvitesParams = {}): Promise<PaginatedResult<Invite>> {
    const { data } = await apiClient.get<PaginatedResult<Invite>>('/invites', {
      params: { page: 1, limit: 20, ...params },
    });
    return data;
  },

  async create(input: CreateInviteInput): Promise<Invite> {
    const { data } = await apiClient.post<Invite>('/invites', input);
    return data;
  },

  /** Re-mints the token — every earlier link for this invite stops working. */
  async resend(id: string): Promise<Invite> {
    const { data } = await apiClient.post<Invite>(`/invites/${id}/resend`);
    return data;
  },

  async revoke(id: string): Promise<Invite> {
    const { data } = await apiClient.post<Invite>(`/invites/${id}/revoke`);
    return data;
  },

  /** Pending invites addressed to the signed-in user — the holding state reads this. */
  async mine(): Promise<Invite[]> {
    const { data } = await apiClient.get<Invite[]>('/invites/mine');
    return data;
  },

  /** Transition out of the holding state. No password: the account already has one. */
  async claim(token: string): Promise<void> {
    await apiClient.post('/invites/claim', { token });
  },
};

/** Query keys, filter object LAST so a prefix invalidation clears every permutation. */
export const inviteKeys = {
  all: ['invites'] as const,
  lists: () => [...inviteKeys.all, 'list'] as const,
  list: (params: ListInvitesParams) => [...inviteKeys.lists(), params] as const,
  mine: () => [...inviteKeys.all, 'mine'] as const,
  preview: (token: string) => [...inviteKeys.all, 'preview', token] as const,
};
