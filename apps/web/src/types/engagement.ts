/**
 * Mirrors the #75 (problem feedback) and #76 (topics) API contracts.
 *
 * `as const` objects rather than TS `enum`: `apps/web/tsconfig.json` sets
 * `erasableSyntaxOnly`, under which `enum` fails the build.
 */

/** Mirrors `ProblemFeedbackKind` (`problems/feedback/enums/problem-feedback.enums.ts`). */
export const FeedbackKind = {
  DOUBT: 'doubt',
  ISSUE: 'issue',
  SUGGESTION: 'suggestion',
} as const;
export type FeedbackKind = (typeof FeedbackKind)[keyof typeof FeedbackKind];

export const FeedbackStatus = {
  OPEN: 'open',
  RESOLVED: 'resolved',
} as const;
export type FeedbackStatus = (typeof FeedbackStatus)[keyof typeof FeedbackStatus];

/** Only DOUBT notifies staff; the other two sit in the inbox. Labels say so. */
export const FEEDBACK_KIND_LABEL: Record<FeedbackKind, string> = {
  doubt: 'I have a doubt',
  issue: 'Something is wrong with this problem',
  suggestion: 'Suggestion',
};

/** Mirrors `ProblemFeedbackResponseDto`. */
export interface ProblemFeedback {
  id: string;
  problemId: string;
  problemTitle?: string | null;
  authorId: string;
  authorName?: string | null;
  kind: FeedbackKind;
  body: string;
  status: FeedbackStatus;
  resolvedById: string | null;
  resolvedByName?: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  createdAt: string;
}

/** Mirrors `TopicResponseDto`. `isGlobal` stands in for the org id, which is never projected. */
export interface Topic {
  id: string;
  title: string;
  description: string;
  isLocked: boolean;
  isGlobal: boolean;
  createdById: string | null;
  createdByName?: string | null;
  createdAt: string;
  commentCount?: number;
}

/** Mirrors `TopicCommentResponseDto`. */
export interface TopicComment {
  id: string;
  topicId: string;
  authorId: string;
  authorName?: string | null;
  body: string;
  parentId: string | null;
  isQuestion: boolean;
  resolvedAt: string | null;
  resolvedById: string | null;
  createdAt: string;
}
