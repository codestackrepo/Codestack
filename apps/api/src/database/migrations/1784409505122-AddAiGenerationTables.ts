import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiGenerationTables1784409505122 implements MigrationInterface {
  name = 'AddAiGenerationTables1784409505122';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."generation_requests_source_type_enum" AS ENUM('prompt', 'pdf', 'txt', 'md', 'docx')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."generation_requests_status_enum" AS ENUM('queued', 'generating', 'validating', 'ready', 'failed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "generation_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "source_type" "public"."generation_requests_source_type_enum" NOT NULL, "source_ref" character varying(255), "topic" character varying(255) NOT NULL, "status" "public"."generation_requests_status_enum" NOT NULL DEFAULT 'queued', "model" character varying(100), "token_usage" jsonb, "error_reason" character varying(255), "requested_count" smallint NOT NULL DEFAULT '2', "completed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_11d2209b1c2409d7119ef35b9de" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_generation_request_user" ON "generation_requests" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_generation_request_status" ON "generation_requests" ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_generation_request_user_created" ON "generation_requests" ("user_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."generated_problem_links_status_enum" AS ENUM('validated', 'discarded', 'saved')`,
    );
    await queryRunner.query(
      `CREATE TABLE "generated_problem_links" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "generation_request_id" uuid NOT NULL, "problem_id" uuid, "status" "public"."generated_problem_links_status_enum" NOT NULL, "per_language_pass" jsonb NOT NULL, "draft" jsonb NOT NULL, CONSTRAINT "PK_f7283f771029a6133bc59c4402d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_gpl_request_status" ON "generated_problem_links" ("generation_request_id", "status") `,
    );
    await queryRunner.query(
      `ALTER TABLE "generation_requests" ADD CONSTRAINT "FK_3864f853d29f158206c5842ac0f" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "generated_problem_links" ADD CONSTRAINT "FK_156ad1973ffb0a3578917527f41" FOREIGN KEY ("generation_request_id") REFERENCES "generation_requests"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "generated_problem_links" ADD CONSTRAINT "FK_5cfd69f78dad3d9f243265116a0" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "generated_problem_links" DROP CONSTRAINT "FK_5cfd69f78dad3d9f243265116a0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "generated_problem_links" DROP CONSTRAINT "FK_156ad1973ffb0a3578917527f41"`,
    );
    await queryRunner.query(
      `ALTER TABLE "generation_requests" DROP CONSTRAINT "FK_3864f853d29f158206c5842ac0f"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_gpl_request_status"`);
    await queryRunner.query(`DROP TABLE "generated_problem_links"`);
    await queryRunner.query(`DROP TYPE "public"."generated_problem_links_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."idx_generation_request_user_created"`);
    await queryRunner.query(`DROP INDEX "public"."idx_generation_request_status"`);
    await queryRunner.query(`DROP INDEX "public"."idx_generation_request_user"`);
    await queryRunner.query(`DROP TABLE "generation_requests"`);
    await queryRunner.query(`DROP TYPE "public"."generation_requests_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."generation_requests_source_type_enum"`);
  }
}
