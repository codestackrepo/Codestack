import { useQuery } from '@tanstack/react-query';
import { gamificationApi } from '../api/gamification.api';

export function useGamificationSummary() {
  return useQuery({
    queryKey: ['gamification', 'summary'],
    queryFn: gamificationApi.summary,
  });
}

export function useContributions(year: number) {
  return useQuery({
    queryKey: ['gamification', 'contributions', year],
    queryFn: () => gamificationApi.contributions(year),
  });
}

export function useSolvedHistory(params: { page?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: ['gamification', 'history', params],
    queryFn: () => gamificationApi.history(params),
  });
}
