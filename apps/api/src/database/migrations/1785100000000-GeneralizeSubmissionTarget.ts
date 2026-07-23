import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 5 (docs/REDESIGN.md §7): generalize `submissions` to target either
 * an assignment problem (legacy) or a standalone library problem (practice).
 * Adds `context` + nullable `problem_id`, drops NOT NULL on
 * `assignment_problem_id`, and enforces exactly-one-target via a CHECK added
 * AFTER the default-backfill so all existing rows are already valid. Sole owner
 * of `submissions` DDL.
 */
export class GeneralizeSubmissionTarget1785100000000 implements MigrationInterface {
  name = 'GeneralizeSubmissionTarget1785100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."submissions_context_enum" AS ENUM('practice', 'assignment')`,
    );
    // Default 'assignment' backfills every existing row — with its non-null
    // assignment_problem_id it already satisfies the CHECK added below.
    await queryRunner.query(
      `ALTER TABLE "submissions" ADD COLUMN "context" "public"."submissions_context_enum" NOT NULL DEFAULT 'assignment'`,
    );
    await queryRunner.query(
      `ALTER TABLE "submissions" ALTER COLUMN "assignment_problem_id" DROP NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "submissions" ADD COLUMN "problem_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "submissions" ADD CONSTRAINT "FK_submission_problem" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_submission_user_problem_created" ON "submissions" ("user_id", "problem_id", "created_at")`,
    );
    // CHECK added last: the step-2 backfill already holds for every row.
    await queryRunner.query(
      `ALTER TABLE "submissions" ADD CONSTRAINT "chk_submission_single_target" CHECK (
         (context = 'assignment' AND assignment_problem_id IS NOT NULL AND problem_id IS NULL)
         OR (context = 'practice' AND problem_id IS NOT NULL AND assignment_problem_id IS NULL)
       )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "submissions" DROP CONSTRAINT "chk_submission_single_target"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_submission_user_problem_created"`);
    await queryRunner.query(`ALTER TABLE "submissions" DROP CONSTRAINT "FK_submission_problem"`);
    // DESTRUCTIVE: practice rows have a null assignment_problem_id and cannot be
    // represented once the columns are gone — must be deleted before restoring
    // the NOT NULL constraint below.
    await queryRunner.query(`DELETE FROM "submissions" WHERE context = 'practice'`);
    await queryRunner.query(`ALTER TABLE "submissions" DROP COLUMN "problem_id"`);
    await queryRunner.query(
      `ALTER TABLE "submissions" ALTER COLUMN "assignment_problem_id" SET NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "submissions" DROP COLUMN "context"`);
    await queryRunner.query(`DROP TYPE "public"."submissions_context_enum"`);
  }
}
