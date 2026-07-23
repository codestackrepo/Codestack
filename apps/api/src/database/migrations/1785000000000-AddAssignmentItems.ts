import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 4 (docs/REDESIGN.md §7): polymorphic assignment items
 * (coding | mcq | quiz), MCQ options + responses, quiz responses, the timed
 * attempt anchor; adds `assignment_problems.assignment_item_id` and
 * `problem_scores.grading_status`; backfills one coding item per existing
 * AssignmentProblem and marks historical accepted scores `graded` so existing
 * grades survive the cutover. Sole owner of `problem_scores` alterations.
 */
export class AddAssignmentItems1785000000000 implements MigrationInterface {
  name = 'AddAssignmentItems1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Enum types (names must match TypeORM's derived table_column_enum).
    await queryRunner.query(
      `CREATE TYPE "public"."assignment_items_kind_enum" AS ENUM('coding', 'mcq', 'quiz')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."assignment_items_grading_mode_enum" AS ENUM('auto', 'manual')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."assignment_attempts_status_enum" AS ENUM('in_progress', 'submitted', 'auto_submitted')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."problem_scores_grading_status_enum" AS ENUM('not_started', 'submitted', 'graded')`,
    );

    // 2. assignment_items
    await queryRunner.query(
      `CREATE TABLE "assignment_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "assignment_id" uuid NOT NULL, "kind" "public"."assignment_items_kind_enum" NOT NULL, "order_index" integer NOT NULL, "max_points" double precision NOT NULL DEFAULT '0', "prompt" text NOT NULL DEFAULT '', "grading_mode" "public"."assignment_items_grading_mode_enum" NOT NULL, "allow_multiple" boolean NOT NULL DEFAULT false, "assignment_problem_id" uuid, CONSTRAINT "PK_assignment_items" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_item_assignment_order" ON "assignment_items" ("assignment_id", "order_index")`,
    );

    // 3. mcq_options
    await queryRunner.query(
      `CREATE TABLE "mcq_options" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "item_id" uuid NOT NULL, "text" text NOT NULL, "is_correct" boolean NOT NULL DEFAULT false, "order_index" integer NOT NULL, CONSTRAINT "PK_mcq_options" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "idx_mcq_option_item" ON "mcq_options" ("item_id")`);

    // 4. mcq_responses
    await queryRunner.query(
      `CREATE TABLE "mcq_responses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "item_id" uuid NOT NULL, "user_id" uuid NOT NULL, "selected_option_ids" jsonb NOT NULL DEFAULT '[]', "awarded_points" double precision NOT NULL DEFAULT '0', CONSTRAINT "uq_mcq_response" UNIQUE ("item_id", "user_id"), CONSTRAINT "PK_mcq_responses" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "idx_mcq_response_user" ON "mcq_responses" ("user_id")`);

    // 5. quiz_responses
    await queryRunner.query(
      `CREATE TABLE "quiz_responses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "item_id" uuid NOT NULL, "user_id" uuid NOT NULL, "answer_text" text NOT NULL DEFAULT '', "awarded_points" double precision, "feedback" text NOT NULL DEFAULT '', "graded_by_id" uuid, CONSTRAINT "uq_quiz_response" UNIQUE ("item_id", "user_id"), CONSTRAINT "PK_quiz_responses" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_quiz_response_user" ON "quiz_responses" ("user_id")`,
    );

    // 6. assignment_attempts
    await queryRunner.query(
      `CREATE TABLE "assignment_attempts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "assignment_id" uuid NOT NULL, "user_id" uuid NOT NULL, "started_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deadline_at" TIMESTAMP WITH TIME ZONE NOT NULL, "submitted_at" TIMESTAMP WITH TIME ZONE, "status" "public"."assignment_attempts_status_enum" NOT NULL DEFAULT 'in_progress', CONSTRAINT "uq_attempt" UNIQUE ("assignment_id", "user_id"), CONSTRAINT "PK_assignment_attempts" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "idx_attempt_user" ON "assignment_attempts" ("user_id")`);

    // 7. assignment_problems.assignment_item_id (nullable)
    await queryRunner.query(`ALTER TABLE "assignment_problems" ADD "assignment_item_id" uuid`);

    // 8. problem_scores.grading_status
    await queryRunner.query(
      `ALTER TABLE "problem_scores" ADD "grading_status" "public"."problem_scores_grading_status_enum" NOT NULL DEFAULT 'not_started'`,
    );

    // 9. Foreign keys.
    await queryRunner.query(
      `ALTER TABLE "assignment_items" ADD CONSTRAINT "FK_item_assignment" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignment_items" ADD CONSTRAINT "FK_item_assignment_problem" FOREIGN KEY ("assignment_problem_id") REFERENCES "assignment_problems"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "mcq_options" ADD CONSTRAINT "FK_mcq_option_item" FOREIGN KEY ("item_id") REFERENCES "assignment_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "mcq_responses" ADD CONSTRAINT "FK_mcq_response_item" FOREIGN KEY ("item_id") REFERENCES "assignment_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "mcq_responses" ADD CONSTRAINT "FK_mcq_response_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "quiz_responses" ADD CONSTRAINT "FK_quiz_response_item" FOREIGN KEY ("item_id") REFERENCES "assignment_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "quiz_responses" ADD CONSTRAINT "FK_quiz_response_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignment_attempts" ADD CONSTRAINT "FK_attempt_assignment" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignment_attempts" ADD CONSTRAINT "FK_attempt_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignment_problems" ADD CONSTRAINT "FK_ap_assignment_item" FOREIGN KEY ("assignment_item_id") REFERENCES "assignment_items"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    // ---- Backfill (after tables/columns/FKs exist) ----
    // One coding item per existing assignment_problems row, ordered by
    // created_at within each assignment; then point the AP back at its item.
    await queryRunner.query(`
      INSERT INTO assignment_items (id, created_at, updated_at, assignment_id, kind, order_index, max_points, prompt, grading_mode, allow_multiple, assignment_problem_id)
      SELECT uuid_generate_v4(), now(), now(), ap.assignment_id, 'coding',
             (row_number() OVER (PARTITION BY ap.assignment_id ORDER BY ap.created_at) - 1)::int,
             ap.score, '', 'manual', false, ap.id
      FROM assignment_problems ap
    `);
    await queryRunner.query(`
      UPDATE assignment_problems ap
      SET assignment_item_id = ai.id
      FROM assignment_items ai
      WHERE ai.assignment_problem_id = ap.id
    `);

    // Historical grading status so existing grades are not zeroed under the new
    // professor-driven model (docs/REDESIGN.md §10).
    await queryRunner.query(`UPDATE problem_scores SET grading_status = 'graded' WHERE score > 0`);
    await queryRunner.query(
      `UPDATE problem_scores SET grading_status = 'submitted' WHERE score = 0 AND submission_id IS NOT NULL`,
    );
    // All others keep the 'not_started' default.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "assignment_problems" DROP CONSTRAINT "FK_ap_assignment_item"`,
    );
    await queryRunner.query(`ALTER TABLE "assignment_attempts" DROP CONSTRAINT "FK_attempt_user"`);
    await queryRunner.query(
      `ALTER TABLE "assignment_attempts" DROP CONSTRAINT "FK_attempt_assignment"`,
    );
    await queryRunner.query(`ALTER TABLE "quiz_responses" DROP CONSTRAINT "FK_quiz_response_user"`);
    await queryRunner.query(`ALTER TABLE "quiz_responses" DROP CONSTRAINT "FK_quiz_response_item"`);
    await queryRunner.query(`ALTER TABLE "mcq_responses" DROP CONSTRAINT "FK_mcq_response_user"`);
    await queryRunner.query(`ALTER TABLE "mcq_responses" DROP CONSTRAINT "FK_mcq_response_item"`);
    await queryRunner.query(`ALTER TABLE "mcq_options" DROP CONSTRAINT "FK_mcq_option_item"`);
    await queryRunner.query(
      `ALTER TABLE "assignment_items" DROP CONSTRAINT "FK_item_assignment_problem"`,
    );
    await queryRunner.query(`ALTER TABLE "assignment_items" DROP CONSTRAINT "FK_item_assignment"`);

    await queryRunner.query(`ALTER TABLE "problem_scores" DROP COLUMN "grading_status"`);
    await queryRunner.query(`ALTER TABLE "assignment_problems" DROP COLUMN "assignment_item_id"`);

    await queryRunner.query(`DROP INDEX "public"."idx_attempt_user"`);
    await queryRunner.query(`DROP TABLE "assignment_attempts"`);
    await queryRunner.query(`DROP INDEX "public"."idx_quiz_response_user"`);
    await queryRunner.query(`DROP TABLE "quiz_responses"`);
    await queryRunner.query(`DROP INDEX "public"."idx_mcq_response_user"`);
    await queryRunner.query(`DROP TABLE "mcq_responses"`);
    await queryRunner.query(`DROP INDEX "public"."idx_mcq_option_item"`);
    await queryRunner.query(`DROP TABLE "mcq_options"`);
    await queryRunner.query(`DROP INDEX "public"."idx_item_assignment_order"`);
    await queryRunner.query(`DROP TABLE "assignment_items"`);

    await queryRunner.query(`DROP TYPE "public"."problem_scores_grading_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."assignment_attempts_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."assignment_items_grading_mode_enum"`);
    await queryRunner.query(`DROP TYPE "public"."assignment_items_kind_enum"`);
  }
}
