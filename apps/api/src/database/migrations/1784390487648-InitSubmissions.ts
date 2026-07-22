import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSubmissions1784390487648 implements MigrationInterface {
  name = 'InitSubmissions1784390487648';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."submissions_language_enum" AS ENUM('python', 'javascript', 'java', 'cpp')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."submissions_status_enum" AS ENUM('Pending', 'Running', 'Accepted', 'Wrong Answer', 'Time Limit Exceeded', 'Memory Limit Exceeded', 'Runtime Error', 'Syntax Error', 'Compile Error', 'Internal Error', 'Finished')`,
    );
    await queryRunner.query(
      `CREATE TABLE "submissions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "assignment_problem_id" uuid NOT NULL, "language" "public"."submissions_language_enum" NOT NULL, "user_code" text NOT NULL, "status" "public"."submissions_status_enum" NOT NULL DEFAULT 'Pending', "passed_testcase_count" integer NOT NULL DEFAULT '0', "total_testcase_count" integer NOT NULL DEFAULT '0', "failed_testcase_detail" jsonb, "runtime_ms" integer, "memory_bytes" bigint, CONSTRAINT "PK_10b3be95b8b2fb1e482e07d706b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "idx_submission_status" ON "submissions" ("status") `);
    await queryRunner.query(
      `CREATE INDEX "idx_submission_user_ap_created" ON "submissions" ("user_id", "assignment_problem_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."test_case_results_verdict_enum" AS ENUM('Pending', 'Running', 'Accepted', 'Wrong Answer', 'Time Limit Exceeded', 'Memory Limit Exceeded', 'Runtime Error', 'Syntax Error', 'Compile Error', 'Internal Error', 'Finished')`,
    );
    await queryRunner.query(
      `CREATE TABLE "test_case_results" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "submission_id" uuid NOT NULL, "test_case_id" uuid, "ordinal" integer NOT NULL, "verdict" "public"."test_case_results_verdict_enum" NOT NULL, "runtime_ms" integer NOT NULL DEFAULT '0', "memory_bytes" bigint NOT NULL DEFAULT '0', "exit_code" integer, "stdout" text NOT NULL DEFAULT '', "stderr" text NOT NULL DEFAULT '', "output_extracted" text NOT NULL DEFAULT '', "truncated" boolean NOT NULL DEFAULT false, "is_sample" boolean NOT NULL DEFAULT false, CONSTRAINT "uq_tcr_submission_testcase" UNIQUE ("submission_id", "test_case_id"), CONSTRAINT "PK_d5fdc2fcb8b5b14d9e9bbd2b511" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_tcr_submission_ordinal" ON "test_case_results" ("submission_id", "ordinal") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."execution_jobs_status_enum" AS ENUM('queued', 'running', 'completed', 'failed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "execution_jobs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "submission_id" uuid NOT NULL, "queue_job_id" character varying(255) NOT NULL, "status" "public"."execution_jobs_status_enum" NOT NULL DEFAULT 'queued', "attempts" integer NOT NULL DEFAULT '0', "error" text, "metadata" jsonb, "started_at" TIMESTAMP WITH TIME ZONE, "finished_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_e3b3db981b336171329e1d13020" UNIQUE ("queue_job_id"), CONSTRAINT "PK_2fe3a7dc112ab699817645ed710" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_execution_job_submission" ON "execution_jobs" ("submission_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_execution_job_queue_id" ON "execution_jobs" ("queue_job_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_execution_job_status" ON "execution_jobs" ("status") `,
    );
    await queryRunner.query(
      `ALTER TABLE "submissions" ADD CONSTRAINT "FK_fca12c4ddd646dea4572c6815a9" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "submissions" ADD CONSTRAINT "FK_27fbc06b54217263375834d4470" FOREIGN KEY ("assignment_problem_id") REFERENCES "assignment_problems"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "test_case_results" ADD CONSTRAINT "FK_76a892a41033a18c9bcd6e4fadb" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "execution_jobs" ADD CONSTRAINT "FK_3c27a344578024c6bb93ee7453c" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "execution_jobs" DROP CONSTRAINT "FK_3c27a344578024c6bb93ee7453c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "test_case_results" DROP CONSTRAINT "FK_76a892a41033a18c9bcd6e4fadb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "submissions" DROP CONSTRAINT "FK_27fbc06b54217263375834d4470"`,
    );
    await queryRunner.query(
      `ALTER TABLE "submissions" DROP CONSTRAINT "FK_fca12c4ddd646dea4572c6815a9"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_execution_job_status"`);
    await queryRunner.query(`DROP INDEX "public"."idx_execution_job_queue_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_execution_job_submission"`);
    await queryRunner.query(`DROP TABLE "execution_jobs"`);
    await queryRunner.query(`DROP TYPE "public"."execution_jobs_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."idx_tcr_submission_ordinal"`);
    await queryRunner.query(`DROP TABLE "test_case_results"`);
    await queryRunner.query(`DROP TYPE "public"."test_case_results_verdict_enum"`);
    await queryRunner.query(`DROP INDEX "public"."idx_submission_user_ap_created"`);
    await queryRunner.query(`DROP INDEX "public"."idx_submission_status"`);
    await queryRunner.query(`DROP TABLE "submissions"`);
    await queryRunner.query(`DROP TYPE "public"."submissions_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."submissions_language_enum"`);
  }
}
