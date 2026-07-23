import { apiClient } from '@/lib/api-client';
import type {
  Assignment,
  AssignmentProblem,
  CreateAssignmentInput,
  UpdateAssignmentInput,
} from '@/types/assignment';
import type { PaginatedResult } from '@/types/common';

export interface AssignmentsQuery {
  page?: number;
  limit?: number;
  classroomId?: string;
}

export const assignmentsApi = {
  async list(query: AssignmentsQuery = {}): Promise<PaginatedResult<Assignment>> {
    const { data } = await apiClient.get<PaginatedResult<Assignment>>('/assignments', {
      params: { page: 1, limit: 20, ...query },
    });
    return data;
  },

  async deadlines(): Promise<Assignment[]> {
    const { data } = await apiClient.get<Assignment[]>('/assignments/deadlines');
    return data;
  },

  async problems(assignmentId: string): Promise<AssignmentProblem[]> {
    const { data } = await apiClient.get<AssignmentProblem[]>(
      `/assignments/${assignmentId}/problems`,
    );
    return data;
  },

  async getById(id: string): Promise<Assignment> {
    const { data } = await apiClient.get<Assignment>(`/assignments/${id}`);
    return data;
  },

  async create(input: CreateAssignmentInput): Promise<Assignment> {
    const { data } = await apiClient.post<Assignment>('/assignments', input);
    return data;
  },

  async update(id: string, input: UpdateAssignmentInput): Promise<Assignment> {
    const { data } = await apiClient.patch<Assignment>(`/assignments/${id}`, input);
    return data;
  },
};
