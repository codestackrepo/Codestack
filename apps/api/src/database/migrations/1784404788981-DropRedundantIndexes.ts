import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropRedundantIndexes1784404788981 implements MigrationInterface {
  name = 'DropRedundantIndexes1784404788981';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_ap_assignment"`);
    await queryRunner.query(`DROP INDEX "public"."idx_execution_job_queue_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_problem_score_ap"`);
    await queryRunner.query(`DROP INDEX "public"."idx_assignment_score_assignment"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "idx_assignment_score_assignment" ON "assignment_scores" ("assignment_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_problem_score_ap" ON "problem_scores" ("assignment_problem_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_execution_job_queue_id" ON "execution_jobs" ("queue_job_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_ap_assignment" ON "assignment_problems" ("assignment_id") `,
    );
  }
}
