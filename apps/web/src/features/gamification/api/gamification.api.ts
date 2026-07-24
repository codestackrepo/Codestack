import { apiClient } from '@/lib/api-client';
import type { PaginatedResult } from '@/types/common';
import type { ContributionsResponse, GamificationSummary, SolvedHistoryItem } from '../types';

/** Owner-only gamification reads (#36). No leaderboard / cross-user access. */
export const gamificationApi = {
  async summary(): Promise<GamificationSummary> {
    const { data } = await apiClient.get<GamificationSummary>('/gamification/me/summary');
    return data;
  },

  async contributions(year?: number): Promise<ContributionsResponse> {
    const { data } = await apiClient.get<ContributionsResponse>('/gamification/me/contributions', {
      params: year ? { year } : undefined,
    });
    return data;
  },

  async history(
    params: { page?: number; limit?: number } = {},
  ): Promise<PaginatedResult<SolvedHistoryItem>> {
    const { data } = await apiClient.get<PaginatedResult<SolvedHistoryItem>>(
      '/gamification/me/history',
      { params },
    );
    return data;
  },
};
