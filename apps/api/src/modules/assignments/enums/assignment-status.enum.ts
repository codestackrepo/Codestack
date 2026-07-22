export enum AssignmentStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  GRADE_PUBLISHED = 'grade_published',
}

/** Statuses in which students/graders may see an assignment. */
export const VISIBLE_TO_STUDENTS: AssignmentStatus[] = [
  AssignmentStatus.ACTIVE,
  AssignmentStatus.COMPLETED,
  AssignmentStatus.GRADE_PUBLISHED,
];
