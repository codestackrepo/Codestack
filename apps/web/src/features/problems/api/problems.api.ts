import { apiClient } from '@/lib/api-client';
import type { CreateProblemInput, Problem, ProblemFacets } from '@/types/problem';
import type { PaginatedResult } from '@/types/common';

export interface ProblemsQuery {
  page?: number;
  limit?: number;
  difficulty?: string;
  search?: string;
  tag?: string;
  company?: string;
  /**
   * Narrows the catalog to one scope (#70). A FILTER, never a grant: the server
   * applies it after its visibility predicate, so it can only ever narrow.
   */
  scope?: 'global' | 'org';
}

export const problemsApi = {
  async list(query: ProblemsQuery = {}): Promise<PaginatedResult<Problem>> {
    const { data } = await apiClient.get<PaginatedResult<Problem>>('/problems', {
      params: { page: 1, limit: 20, ...query },
    });
    return data;
  },

  async facets(): Promise<ProblemFacets> {
    const { data } = await apiClient.get<ProblemFacets>('/problems/facets');
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

  /**
   * Copy a problem the caller can SEE into their own org, test cases and judge spec
   * included. This is how a university takes a global-catalog problem into its own
   * ecosystem: the copy is theirs to edit, and the original is untouched.
   *
   * The copy lands PRIVATE deliberately — it is a draft until its new owner decides
   * to share it, and inheriting `shared` would publish it to the whole tenant on the
   * strength of one click.
   */
  async clone(id: string): Promise<Problem> {
    const { data } = await apiClient.post<Problem>(`/problems/${id}/clone`);
    return data;
  },
};
