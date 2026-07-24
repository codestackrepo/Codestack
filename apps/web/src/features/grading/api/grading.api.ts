import { apiClient } from '@/lib/api-client';
import type {
  AssignmentScoreRow,
  ItemReview,
  ItemScore,
  ProblemScoreEntity,
  StudentScore,
  UpdateScoreInput,
} from '../types';

/**
 * Grading endpoints (all mounted under the apiClient baseURL's /api/v1 prefix).
 * No pagination envelopes anywhere — bare objects / bare arrays.
 */
export const gradingApi = {
  /** The caller's OWN score for an assignment (any authenticated user). */
  async myScore(assignmentId: string): Promise<StudentScore> {
    const { data } = await apiClient.get<StudentScore>(
      `/grading/assignments/${assignmentId}/my-score`,
    );
    return data;
  },

  /** Every enrolled student's score — staff/grader only. Bare JSON array. */
  async studentsScores(assignmentId: string): Promise<StudentScore[]> {
    const { data } = await apiClient.get<StudentScore[]>(
      `/grading/assignments/${assignmentId}/students-scores`,
    );
    return data;
  },

  /** The caller's OWN assignment-level score row (shape is inconsistent — see type). */
  async myAssignmentScore(assignmentId: string): Promise<AssignmentScoreRow> {
    const { data } = await apiClient.get<AssignmentScoreRow>(
      `/grading/assignments/${assignmentId}/score`,
    );
    return data;
  },

  /** Legacy coding-only per-problem override — staff/grader only. */
  async updateScore(
    assignmentProblemId: string,
    studentId: string,
    input: UpdateScoreInput,
  ): Promise<ProblemScoreEntity> {
    const { data } = await apiClient.patch<ProblemScoreEntity>(
      `/grading/problems/${assignmentProblemId}/students/${studentId}`,
      input,
    );
    return data;
  },

  /** Item-keyed manual grade (coding/quiz/mcq-override) — staff/grader only. */
  async updateItemScore(
    itemId: string,
    studentId: string,
    input: UpdateScoreInput,
  ): Promise<ItemScore> {
    const { data } = await apiClient.patch<ItemScore>(
      `/grading/items/${itemId}/students/${studentId}`,
      input,
    );
    return data;
  },

  /** Staff item-review detail for the review drawer — staff/grader only. */
  async itemReview(itemId: string, studentId: string): Promise<ItemReview> {
    const { data } = await apiClient.get<ItemReview>(
      `/grading/items/${itemId}/students/${studentId}`,
    );
    return data;
  },
};
