import { apiClient } from '@/lib/api-client';
import type { FeedbackKind, ProblemFeedback, Topic, TopicComment } from '@/types/engagement';

/**
 * Problem feedback (#75) and topics (#76).
 *
 * Neither surface takes an organization id. Feedback is anchored to the AUTHOR's org
 * server-side, and a global topic's comments are partitioned by the commenter's org —
 * so the tenant is always derived from the session, never sent.
 */
export const engagementApi = {
  // ---- problem feedback (#75) ----

  async listFeedback(problemId: string): Promise<ProblemFeedback[]> {
    const { data } = await apiClient.get<ProblemFeedback[]>(`/problems/${problemId}/feedback`);
    return data;
  },

  async raiseFeedback(
    problemId: string,
    input: { kind: FeedbackKind; body: string },
  ): Promise<ProblemFeedback> {
    const { data } = await apiClient.post<ProblemFeedback>(
      `/problems/${problemId}/feedback`,
      input,
    );
    return data;
  },

  /** Staff doubts inbox. `status=open` is the working view. */
  async listFeedbackInbox(params: { status?: string } = {}): Promise<ProblemFeedback[]> {
    const { data } = await apiClient.get<ProblemFeedback[]>('/feedback', { params });
    return data;
  },

  async resolveFeedback(id: string, resolutionNote?: string): Promise<ProblemFeedback> {
    const { data } = await apiClient.patch<ProblemFeedback>(`/feedback/${id}/resolve`, {
      resolutionNote,
    });
    return data;
  },

  // ---- topics (#76) ----

  async listTopics(): Promise<Topic[]> {
    const { data } = await apiClient.get<Topic[]>('/topics');
    return data;
  },

  async getTopic(id: string): Promise<Topic> {
    const { data } = await apiClient.get<Topic>(`/topics/${id}`);
    return data;
  },

  async createTopic(input: {
    title: string;
    description?: string;
    global?: boolean;
  }): Promise<Topic> {
    const { data } = await apiClient.post<Topic>('/topics', input);
    return data;
  },

  async setTopicLocked(id: string, isLocked: boolean): Promise<Topic> {
    const { data } = await apiClient.patch<Topic>(`/topics/${id}`, { isLocked });
    return data;
  },

  async listComments(topicId: string): Promise<TopicComment[]> {
    const { data } = await apiClient.get<TopicComment[]>(`/topics/${topicId}/comments`);
    return data;
  },

  async addComment(
    topicId: string,
    input: { body: string; parentId?: string; isQuestion?: boolean },
  ): Promise<TopicComment> {
    const { data } = await apiClient.post<TopicComment>(`/topics/${topicId}/comments`, input);
    return data;
  },

  /** Unanswered questions in the actor's org — the staff doubts view. */
  async listOpenQuestions(): Promise<TopicComment[]> {
    const { data } = await apiClient.get<TopicComment[]>('/topics/questions');
    return data;
  },

  async resolveQuestion(commentId: string): Promise<TopicComment> {
    const { data } = await apiClient.patch<TopicComment>(`/topics/comments/${commentId}/resolve`);
    return data;
  },

  async deleteComment(commentId: string): Promise<void> {
    await apiClient.delete(`/topics/comments/${commentId}`);
  },
};

/**
 * Org goes in every key. These lists are tenant-scoped server-side, and #72's cache
 * clear on logout covers an identity change — but a SuperAdmin moving between orgs
 * within one session would otherwise reuse a cached thread.
 */
export const engagementKeys = {
  all: ['engagement'] as const,
  feedback: (problemId: string, orgId: string | null) =>
    [...engagementKeys.all, 'feedback', orgId, problemId] as const,
  feedbackInbox: (orgId: string | null, params: object = {}) =>
    [...engagementKeys.all, 'feedback-inbox', orgId, params] as const,
  topics: (orgId: string | null) => [...engagementKeys.all, 'topics', orgId] as const,
  topic: (id: string, orgId: string | null) =>
    [...engagementKeys.all, 'topics', orgId, id] as const,
  comments: (topicId: string, orgId: string | null) =>
    [...engagementKeys.all, 'topics', orgId, topicId, 'comments'] as const,
  openQuestions: (orgId: string | null) =>
    [...engagementKeys.all, 'open-questions', orgId] as const,
};
