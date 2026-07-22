import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitAssignments1784389613287 implements MigrationInterface {
  name = 'InitAssignments1784389613287';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."assignments_status_enum" AS ENUM('draft', 'scheduled', 'active', 'completed', 'grade_published')`,
    );
    await queryRunner.query(
      `CREATE TABLE "assignments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "title" character varying(255) NOT NULL, "description" text NOT NULL DEFAULT '', "start_date" TIMESTAMP WITH TIME ZONE NOT NULL, "end_date" TIMESTAMP WITH TIME ZONE NOT NULL, "classroom_id" uuid NOT NULL, "created_by_id" uuid NOT NULL, "status" "public"."assignments_status_enum" NOT NULL DEFAULT 'scheduled', "published_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_c54ca359535e0012b04dcbd80ee" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_assignment_classroom" ON "assignments" ("classroom_id") `,
    );
    await queryRunner.query(`CREATE INDEX "idx_assignment_status" ON "assignments" ("status") `);
    await queryRunner.query(
      `CREATE INDEX "idx_assignment_classroom_status" ON "assignments" ("classroom_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "assignment_problems" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "assignment_id" uuid NOT NULL, "problem_id" uuid NOT NULL, "score" double precision NOT NULL DEFAULT '0', "is_imported" boolean NOT NULL DEFAULT false, CONSTRAINT "uq_assignment_problem" UNIQUE ("assignment_id", "problem_id"), CONSTRAINT "PK_cb626b21cb11ae8a727e3c9dfdf" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_ap_assignment" ON "assignment_problems" ("assignment_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."problem_templates_language_enum" AS ENUM('python', 'javascript', 'java', 'cpp')`,
    );
    await queryRunner.query(
      `CREATE TABLE "problem_templates" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "assignment_problem_id" uuid NOT NULL, "language" "public"."problem_templates_language_enum" NOT NULL, "driver_code" text NOT NULL DEFAULT '', "starter_code" text NOT NULL DEFAULT '', CONSTRAINT "PK_bae8f69269f0d16800fbde51212" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_template_ap_lang" ON "problem_templates" ("assignment_problem_id", "language") `,
    );
    await queryRunner.query(
      `ALTER TABLE "assignments" ADD CONSTRAINT "FK_86e7005d670a6ae7eaae7e0fdbd" FOREIGN KEY ("classroom_id") REFERENCES "classrooms"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignments" ADD CONSTRAINT "FK_fb280a865b6b9eb71d7da1b1e41" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignment_problems" ADD CONSTRAINT "FK_939580320b59824a3b8ee61e1f7" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignment_problems" ADD CONSTRAINT "FK_4c985e08eb20326a1d0d899988c" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "problem_templates" ADD CONSTRAINT "FK_1ee8b9c49d50dc43950e7a550e2" FOREIGN KEY ("assignment_problem_id") REFERENCES "assignment_problems"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "problem_templates" DROP CONSTRAINT "FK_1ee8b9c49d50dc43950e7a550e2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignment_problems" DROP CONSTRAINT "FK_4c985e08eb20326a1d0d899988c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignment_problems" DROP CONSTRAINT "FK_939580320b59824a3b8ee61e1f7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignments" DROP CONSTRAINT "FK_fb280a865b6b9eb71d7da1b1e41"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignments" DROP CONSTRAINT "FK_86e7005d670a6ae7eaae7e0fdbd"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_template_ap_lang"`);
    await queryRunner.query(`DROP TABLE "problem_templates"`);
    await queryRunner.query(`DROP TYPE "public"."problem_templates_language_enum"`);
    await queryRunner.query(`DROP INDEX "public"."idx_ap_assignment"`);
    await queryRunner.query(`DROP TABLE "assignment_problems"`);
    await queryRunner.query(`DROP INDEX "public"."idx_assignment_classroom_status"`);
    await queryRunner.query(`DROP INDEX "public"."idx_assignment_status"`);
    await queryRunner.query(`DROP INDEX "public"."idx_assignment_classroom"`);
    await queryRunner.query(`DROP TABLE "assignments"`);
    await queryRunner.query(`DROP TYPE "public"."assignments_status_enum"`);
  }
}
