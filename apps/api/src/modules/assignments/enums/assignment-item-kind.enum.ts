/**
 * The kind of a single assignment item. `coding` wraps an AssignmentProblem
 * 1:1 (the existing judge path is untouched); `mcq`/`quiz` are new item types
 * (docs/REDESIGN.md §5.3).
 */
export enum AssignmentItemKind {
  CODING = 'coding',
  MCQ = 'mcq',
  QUIZ = 'quiz',
}
