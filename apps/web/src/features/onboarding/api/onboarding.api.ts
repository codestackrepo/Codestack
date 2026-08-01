import { apiClient } from '@/lib/api-client';
import type { PaginatedResult } from '@/types/common';

export type RequestStatus = 'pending' | 'approved' | 'rejected';

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

/**
 * Professor ACCESS REQUESTS only. The invite half was retired with
 * `professor_invites` (#104) — invitations are `org_invites` now, minted from the
 * org console and accepted at /invite/:token, and no client surface ever receives
 * the raw token.
 */
export const onboardingApi = {
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
    const { data } = await apiClient.get<PaginatedResult<ProfessorRequest>>(
      '/onboarding/requests',
      {
        params: { page: 1, limit: 20, ...params },
      },
    );
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
