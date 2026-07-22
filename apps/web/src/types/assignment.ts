import type { Language } from './common';

export const AssignmentStatus = {
  DRAFT: 'draft',
  SCHEDULED: 'scheduled',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  GRADE_PUBLISHED: 'grade_published',
} as const;
export type AssignmentStatus = (typeof AssignmentStatus)[keyof typeof AssignmentStatus];

export interface Assignment {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  classroomId: string;
  createdById: string;
  status: AssignmentStatus;
  publishedAt: string | null;
}

export interface AssignmentProblem {
  id: string;
  assignmentId: string;
  problemId: string;
  title: string;
  difficulty: string;
  tags: string[];
  score: number;
  isImported: boolean;
  languages: Language[];
}
