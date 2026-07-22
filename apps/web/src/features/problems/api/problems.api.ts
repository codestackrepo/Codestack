import { apiClient } from '@/lib/api-client';
import type { CreateProblemInput, Problem } from '@/types/problem';
import type { PaginatedResult } from '@/types/common';

export interface ProblemsQuery {
  page?: number;
  limit?: number;
  difficulty?: string;
  search?: string;
  tag?: string;
}

export const problemsApi = {
  async list(query: ProblemsQuery = {}): Promise<PaginatedResult<Problem>> {
    const { data } = await apiClient.get<PaginatedResult<Problem>>('/problems', {
      params: { page: 1, limit: 20, ...query },
    });
    return data;
  },

  async getById(id: string): Promise<Problem> {
    const { data } = await apiClient.get<Problem>(`/problems/${id}`);
    return data;
  },

  async create(input: CreateProblemInput): Promise<Problem> {
    const { data } = await apiClient.post<Problem>('/problems', input);
    return data;
  },
};
