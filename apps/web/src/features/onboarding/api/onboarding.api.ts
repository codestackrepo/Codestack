import { apiClient } from '@/lib/api-client';
import type { PaginatedResult } from '@/types/common';

export type InviteStatus = 'pending' | 'consumed' | 'revoked';
export type RequestStatus = 'pending' | 'approved' | 'rejected';

export interface Invite {
  id: string;
  token: string;
  email: string | null;
  status: InviteStatus;
  expiresAt: string | null;
  consumedAt: string | null;
  createdAt: string;
}

export interface InvitePreview {
  valid: boolean;
  email: string | null;
  role: string;
}

export interface ProfessorRequest {
  id: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  status: RequestStatus;
  message: string;
  decisionReason: string;
  reviewedAt: string | null;
  createdAt: string;
}

export const onboardingApi = {
  // ---- invites (admin) ----
  async listInvites(page = 1, limit = 20): Promise<PaginatedResult<Invite>> {
    const { data } = await apiClient.get<PaginatedResult<Invite>>('/onboarding/invites', {
      params: { page, limit },
    });
    return data;
  },
  async mintInvite(input: { email?: string; expiresInDays?: number }): Promise<Invite> {
    const { data } = await apiClient.post<Invite>('/onboarding/invites', input);
    return data;
  },
  async revokeInvite(id: string): Promise<Invite> {
    const { data } = await apiClient.post<Invite>(`/onboarding/invites/${id}/revoke`);
    return data;
  },
  /** Public — used by the register page to render an invite banner. */
  async previewInvite(token: string): Promise<InvitePreview> {
    const { data } = await apiClient.get<InvitePreview>(
      `/onboarding/invites/${encodeURIComponent(token)}/preview`,
    );
    return data;
  },

  // ---- requests ----
  async createRequest(input: { message?: string }): Promise<ProfessorRequest> {
    const { data } = await apiClient.post<ProfessorRequest>('/onboarding/requests', input);
    return data;
  },
  async myRequest(): Promise<ProfessorRequest | null> {
    const { data } = await apiClient.get<ProfessorRequest | null>('/onboarding/requests/me');
    return data;
  },
  async listRequests(
    params: { page?: number; limit?: number; status?: RequestStatus } = {},
  ): Promise<PaginatedResult<ProfessorRequest>> {
    const { data } = await apiClient.get<PaginatedResult<ProfessorRequest>>('/onboarding/requests', {
      params: { page: 1, limit: 20, ...params },
    });
    return data;
  },
  async approveRequest(id: string): Promise<ProfessorRequest> {
    const { data } = await apiClient.post<ProfessorRequest>(`/onboarding/requests/${id}/approve`);
    return data;
  },
  async rejectRequest(id: string, reason: string): Promise<ProfessorRequest> {
    const { data } = await apiClient.post<ProfessorRequest>(`/onboarding/requests/${id}/reject`, {
      reason,
    });
    return data;
  },
};
