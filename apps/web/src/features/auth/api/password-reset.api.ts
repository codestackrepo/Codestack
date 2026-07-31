import { apiClient } from '@/lib/api-client';

export type ResetTokenStatus = 'valid' | 'expired' | 'used' | 'not_found';

export interface ResetPreview {
  status: ResetTokenStatus;
  /** Masked, and present only when status is 'valid'. */
  maskedEmail?: string;
}

export const passwordResetApi = {
  /**
   * Always resolves 200 with the same body, whether or not the address exists —
   * the endpoint is deliberately non-enumerable, so there is nothing here for the
   * UI to branch on.
   */
  async forgot(email: string): Promise<{ message: string }> {
    const { data } = await apiClient.post<{ message: string }>('/auth/forgot-password', { email });
    return data;
  },

  /** Never 4xxs — a bad token comes back as `{status:'not_found'}`. */
  async preview(token: string): Promise<ResetPreview> {
    const { data } = await apiClient.get<ResetPreview>(
      `/auth/reset/${encodeURIComponent(token)}/preview`,
    );
    return data;
  },

  async reset(token: string, password: string): Promise<void> {
    await apiClient.post('/auth/reset-password', { token, password });
  },
};
