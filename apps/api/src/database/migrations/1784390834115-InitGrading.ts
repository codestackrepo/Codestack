import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitGrading1784390834115 implements MigrationInterface {
  name = 'InitGrading1784390834115';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "problem_scores" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "assignment_problem_id" uuid NOT NULL, "user_id" uuid NOT NULL, "submission_id" uuid, "score" double precision NOT NULL DEFAULT '0', "submission_count" integer NOT NULL DEFAULT '0', "feedback" text NOT NULL DEFAULT '', "created_by_id" uuid, CONSTRAINT "uq_problem_score" UNIQUE ("assignment_problem_id", "user_id"), CONSTRAINT "PK_7f53a180aefd3e648ce79f7bf2f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_problem_score_ap" ON "problem_scores" ("assignment_problem_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_problem_score_user" ON "problem_scores" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "assignment_scores" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "assignment_id" uuid NOT NULL, "user_id" uuid NOT NULL, "final_score" double precision NOT NULL DEFAULT '0', "feedback" text NOT NULL DEFAULT '', "created_by_id" uuid, CONSTRAINT "uq_assignment_score" UNIQUE ("assignment_id", "user_id"), CONSTRAINT "PK_8b251f15adfa96a86b0f5f8556f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_assignment_score_assignment" ON "assignment_scores" ("assignment_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_assignment_score_user" ON "assignment_scores" ("user_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "problem_scores" ADD CONSTRAINT "FK_11a92aed4f2a047b065c096a864" FOREIGN KEY ("assignment_problem_id") REFERENCES "assignment_problems"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "problem_scores" ADD CONSTRAINT "FK_448913995c593f8156dd05c6394" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "problem_scores" ADD CONSTRAINT "FK_04eb26a73d7cc16808d2dcb5c40" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignment_scores" ADD CONSTRAINT "FK_cffbea35d0c9f6588a641eacf17" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignment_scores" ADD CONSTRAINT "FK_673ea1a5ccc2f6612fb1310ec1c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "assignment_scores" DROP CONSTRAINT "FK_673ea1a5ccc2f6612fb1310ec1c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignment_scores" DROP CONSTRAINT "FK_cffbea35d0c9f6588a641eacf17"`,
    );
    await queryRunner.query(
      `ALTER TABLE "problem_scores" DROP CONSTRAINT "FK_04eb26a73d7cc16808d2dcb5c40"`,
    );
    await queryRunner.query(
      `ALTER TABLE "problem_scores" DROP CONSTRAINT "FK_448913995c593f8156dd05c6394"`,
    );
    await queryRunner.query(
      `ALTER TABLE "problem_scores" DROP CONSTRAINT "FK_11a92aed4f2a047b065c096a864"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_assignment_score_user"`);
    await queryRunner.query(`DROP INDEX "public"."idx_assignment_score_assignment"`);
    await queryRunner.query(`DROP TABLE "assignment_scores"`);
    await queryRunner.query(`DROP INDEX "public"."idx_problem_score_user"`);
    await queryRunner.query(`DROP INDEX "public"."idx_problem_score_ap"`);
    await queryRunner.query(`DROP TABLE "problem_scores"`);
  }
}
