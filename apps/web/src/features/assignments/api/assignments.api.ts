import { apiClient } from '@/lib/api-client';
import type {
  Assignment,
  AssignmentItemStaff,
  AssignmentProblem,
  AssignmentTake,
  AttemptStatus,
  CreateAssignmentInput,
  CreateAssignmentItemInput,
  UpdateAssignmentInput,
  UpdateAssignmentItemInput,
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

  /**
   * Hard delete (#46). `DELETE /assignments/:id` has existed since the module
   * shipped; only this method was missing, so there was no way to reach it.
   *
   * `assignment_problems` and `assignment_attempts` both declare
   * `onDelete: 'CASCADE'`, so student attempts and submissions for this assignment
   * go with it. That is why the caller must confirm first — nothing here is
   * recoverable.
   */
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/assignments/${id}`);
  },

  // ---- Mixed items: staff builder (#22, backend #20) ----

  async items(assignmentId: string): Promise<AssignmentItemStaff[]> {
    const { data } = await apiClient.get<AssignmentItemStaff[]>(
      `/assignments/${assignmentId}/items`,
    );
    return data;
  },

  async createItem(
    assignmentId: string,
    input: CreateAssignmentItemInput,
  ): Promise<AssignmentItemStaff> {
    const { data } = await apiClient.post<AssignmentItemStaff>(
      `/assignments/${assignmentId}/items`,
      input,
    );
    return data;
  },

  async updateItem(itemId: string, input: UpdateAssignmentItemInput): Promise<AssignmentItemStaff> {
    const { data } = await apiClient.patch<AssignmentItemStaff>(
      `/assignments/items/${itemId}`,
      input,
    );
    return data;
  },

  async deleteItem(itemId: string): Promise<void> {
    await apiClient.delete(`/assignments/items/${itemId}`);
  },

  async reorderItems(
    assignmentId: string,
    orderedItemIds: string[],
  ): Promise<AssignmentItemStaff[]> {
    const { data } = await apiClient.post<AssignmentItemStaff[]>(
      `/assignments/${assignmentId}/items/reorder`,
      { orderedItemIds },
    );
    return data;
  },

  // ---- Taking: student surface (#22, backend #20) ----

  async take(assignmentId: string): Promise<AssignmentTake> {
    const { data } = await apiClient.get<AssignmentTake>(`/assignments/${assignmentId}/take`);
    return data;
  },

  async startAttempt(
    assignmentId: string,
  ): Promise<{ deadlineAt: string | null; status: AttemptStatus }> {
    const { data } = await apiClient.post<{ deadlineAt: string | null; status: AttemptStatus }>(
      `/assignments/${assignmentId}/attempt/start`,
    );
    return data;
  },

  async saveMcq(itemId: string, selectedOptionIds: string[]): Promise<{ saved: true }> {
    const { data } = await apiClient.put<{ saved: true }>(`/assignments/items/${itemId}/mcq`, {
      selectedOptionIds,
    });
    return data;
  },

  async saveQuiz(itemId: string, answerText: string): Promise<{ saved: true }> {
    const { data } = await apiClient.put<{ saved: true }>(`/assignments/items/${itemId}/quiz`, {
      answerText,
    });
    return data;
  },

  async submitAttempt(
    assignmentId: string,
  ): Promise<{ status: AttemptStatus; submittedAt: string | null }> {
    const { data } = await apiClient.post<{ status: AttemptStatus; submittedAt: string | null }>(
      `/assignments/${assignmentId}/attempt/submit`,
    );
    return data;
  },
};
