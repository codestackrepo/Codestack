import { EntityManager } from 'typeorm';

/**
 * Keeps a coding item's points in lockstep across the two rows that store them:
 * `assignment_problems.score` (judged/graded points) and the wrapping
 * `assignment_items.max_points`. Both write paths — AssignmentsService
 * (editAssignmentProblem) and AssignmentItemsService (updateItem) — call this
 * one helper so the two values can never drift (§ issue #20).
 */
export async function syncCodingPoints(
  manager: EntityManager,
  assignmentProblemId: string,
  points: number,
): Promise<void> {
  await manager.query('UPDATE assignment_problems SET score = $1 WHERE id = $2', [
    points,
    assignmentProblemId,
  ]);
  await manager.query(
    'UPDATE assignment_items SET max_points = $1 WHERE assignment_problem_id = $2',
    [points, assignmentProblemId],
  );
}
