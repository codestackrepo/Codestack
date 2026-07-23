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
  // Both rows must move together — run them in one transaction so a failure
  // between the two UPDATEs can't leave score and max_points drifted (the exact
  // thing this helper exists to prevent). `manager.transaction` reuses an
  // existing transaction when the manager is already transactional.
  await manager.transaction(async (m) => {
    await m.query('UPDATE assignment_problems SET score = $1 WHERE id = $2', [
      points,
      assignmentProblemId,
    ]);
    await m.query('UPDATE assignment_items SET max_points = $1 WHERE assignment_problem_id = $2', [
      points,
      assignmentProblemId,
    ]);
  });
}
