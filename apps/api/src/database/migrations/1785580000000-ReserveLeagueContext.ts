import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #69 (canonical migration #11) — reserve `league` as a submission context.
 *
 * Ships the FAIL-SAFE hook only. No league tables, no league module, no writer. The
 * value exists so a future migration can add its target arm without a second type
 * change on the hottest table in the schema.
 *
 * WHY varchar + CHECK RATHER THAN `ALTER TYPE ... ADD VALUE`:
 *
 * The issue text specifies `ALTER TYPE submissions_context_enum ADD VALUE 'league'`
 * with `transaction = false` and a no-op `down()`. #80's locked product decisions
 * say the opposite, verbatim: "`varchar` + `CHECK`, never `ALTER TYPE ADD VALUE`".
 *
 * The rule wins, and the issue's own shape is the argument for it: Postgres has no
 * `DROP VALUE`, which is exactly why that approach forces an asymmetric no-op
 * `down()`. Converting the column instead makes this migration reversible and makes
 * every future context value an ordinary migration. `submissions` is small now and
 * only gets bigger, so this is the cheapest it will ever be. Recorded here because a
 * reader comparing the issue to this file will otherwise think one of them is wrong.
 *
 * THE RESERVATION IS FAIL-CLOSED, and that is load-bearing:
 * `chk_submission_single_target` permits only
 *
 *     (context = 'assignment' AND assignment_problem_id IS NOT NULL AND problem_id IS NULL)
 *  OR (context = 'practice'   AND problem_id IS NOT NULL AND assignment_problem_id IS NULL)
 *
 * A `league` row satisfies NEITHER arm, so it is rejected at the database no matter
 * what any service does. That constraint is deliberately NOT touched here — making
 * `league` a legal *value* while leaving it an illegal *row* is the whole point of a
 * reservation, and adding its arm is the future league migration's job.
 *
 * NOTE — `down()` is symmetric: it converts the column back to the native enum, which
 * only has `practice` and `assignment`. Any row with `context = 'league'` would fail
 * that cast. None can exist while `chk_submission_single_target` stands, so the
 * rollback is safe today; it stops being safe the moment the league ships its target
 * arm, and that migration owns its own `down()`.
 */
export class ReserveLeagueContext1785580000000 implements MigrationInterface {
  name = 'ReserveLeagueContext1785580000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    /*
     * `chk_submission_single_target` has to come off FIRST and go back on after.
     *
     * Its predicate compares `context = 'assignment'`, and Postgres re-validates the
     * constraint during the type change while the literal is still bound to the old
     * enum — which fails with:
     *
     *   ERROR: operator does not exist: character varying = submissions_context_enum
     *
     * It is re-added verbatim below. That matters more than the conversion itself:
     * it is what makes a `league` row illegal, and dropping it without restoring it
     * would turn this reservation into an opening.
     */
    await queryRunner.query(
      `ALTER TABLE "submissions" DROP CONSTRAINT "chk_submission_single_target"`,
    );
    // The default must go before the type changes — Postgres cannot re-cast it in
    // place — and comes back after.
    await queryRunner.query(`ALTER TABLE "submissions" ALTER COLUMN "context" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "submissions" ALTER COLUMN "context" TYPE character varying(20) ` +
        `USING "context"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "submissions" ALTER COLUMN "context" SET DEFAULT 'assignment'`,
    );
    await queryRunner.query(
      `ALTER TABLE "submissions" ADD CONSTRAINT "chk_submissions_context" ` +
        `CHECK ("context" IN ('practice','assignment','league'))`,
    );
    // Restored UNCHANGED. A `league` row still satisfies neither arm, so it stays
    // rejected at the database — the reservation is a legal value, not a legal row.
    await queryRunner.query(
      `ALTER TABLE "submissions" ADD CONSTRAINT "chk_submission_single_target" CHECK (
         (context = 'assignment' AND assignment_problem_id IS NOT NULL AND problem_id IS NULL)
         OR (context = 'practice' AND problem_id IS NOT NULL AND assignment_problem_id IS NULL)
       )`,
    );
    // The type has no remaining dependants once the column is converted.
    await queryRunner.query(`DROP TYPE "public"."submissions_context_enum"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."submissions_context_enum" AS ENUM('practice', 'assignment')`,
    );
    await queryRunner.query(
      `ALTER TABLE "submissions" DROP CONSTRAINT "chk_submission_single_target"`,
    );
    await queryRunner.query(`ALTER TABLE "submissions" DROP CONSTRAINT "chk_submissions_context"`);
    await queryRunner.query(`ALTER TABLE "submissions" ALTER COLUMN "context" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "submissions" ALTER COLUMN "context" TYPE "public"."submissions_context_enum" ` +
        `USING "context"::"public"."submissions_context_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "submissions" ALTER COLUMN "context" SET DEFAULT 'assignment'`,
    );
    await queryRunner.query(
      `ALTER TABLE "submissions" ADD CONSTRAINT "chk_submission_single_target" CHECK (
         (context = 'assignment' AND assignment_problem_id IS NOT NULL AND problem_id IS NULL)
         OR (context = 'practice' AND problem_id IS NOT NULL AND assignment_problem_id IS NULL)
       )`,
    );
  }
}
