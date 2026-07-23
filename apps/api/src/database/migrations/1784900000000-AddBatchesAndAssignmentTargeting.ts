import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 3 (docs/REDESIGN.md §7): batches (persistent named sub-groups in a
 * classroom) + assignment targeting (whole classroom vs. specific batches) +
 * assignment `kind` (assignment | test) and `duration_minutes`. Sole owner of
 * the `assignments` new columns. Service/controller logic is issue #18.
 */
export class AddBatchesAndAssignmentTargeting1784900000000 implements MigrationInterface {
  name = 'AddBatchesAndAssignmentTargeting1784900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1-2. Enum types (names must match TypeORM's derived table_column_enum).
    await queryRunner.query(
      `CREATE TYPE "public"."assignments_kind_enum" AS ENUM('assignment', 'test')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."assignments_target_type_enum" AS ENUM('classroom', 'batch')`,
    );

    // 3-5. New assignment columns (DEFAULTs cover existing rows — no backfill).
    await queryRunner.query(
      `ALTER TABLE "assignments" ADD "kind" "public"."assignments_kind_enum" NOT NULL DEFAULT 'assignment'`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignments" ADD "target_type" "public"."assignments_target_type_enum" NOT NULL DEFAULT 'classroom'`,
    );
    await queryRunner.query(`ALTER TABLE "assignments" ADD "duration_minutes" integer`);

    // 6. batches
    await queryRunner.query(
      `CREATE TABLE "batches" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying(255) NOT NULL, "classroom_id" uuid NOT NULL, CONSTRAINT "uq_batch_classroom_name" UNIQUE ("classroom_id", "name"), CONSTRAINT "PK_batches" PRIMARY KEY ("id"))`,
    );

    // 7. batch_students join table
    await queryRunner.query(
      `CREATE TABLE "batch_students" ("batch_id" uuid NOT NULL, "user_id" uuid NOT NULL, CONSTRAINT "PK_batch_students" PRIMARY KEY ("batch_id", "user_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_batch_students_batch" ON "batch_students" ("batch_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_batch_students_user" ON "batch_students" ("user_id")`,
    );

    // 8. assignment_target_batches join table
    await queryRunner.query(
      `CREATE TABLE "assignment_target_batches" ("assignment_id" uuid NOT NULL, "batch_id" uuid NOT NULL, CONSTRAINT "PK_assignment_target_batches" PRIMARY KEY ("assignment_id", "batch_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_atb_assignment" ON "assignment_target_batches" ("assignment_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_atb_batch" ON "assignment_target_batches" ("batch_id")`,
    );

    // 9. Foreign keys
    await queryRunner.query(
      `ALTER TABLE "batches" ADD CONSTRAINT "FK_batches_classroom" FOREIGN KEY ("classroom_id") REFERENCES "classrooms"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "batch_students" ADD CONSTRAINT "FK_batch_students_batch" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "batch_students" ADD CONSTRAINT "FK_batch_students_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignment_target_batches" ADD CONSTRAINT "FK_atb_assignment" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignment_target_batches" ADD CONSTRAINT "FK_atb_batch" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "assignment_target_batches" DROP CONSTRAINT "FK_atb_batch"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignment_target_batches" DROP CONSTRAINT "FK_atb_assignment"`,
    );
    await queryRunner.query(
      `ALTER TABLE "batch_students" DROP CONSTRAINT "FK_batch_students_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "batch_students" DROP CONSTRAINT "FK_batch_students_batch"`,
    );
    await queryRunner.query(`ALTER TABLE "batches" DROP CONSTRAINT "FK_batches_classroom"`);

    await queryRunner.query(`DROP INDEX "public"."idx_atb_batch"`);
    await queryRunner.query(`DROP INDEX "public"."idx_atb_assignment"`);
    await queryRunner.query(`DROP TABLE "assignment_target_batches"`);
    await queryRunner.query(`DROP INDEX "public"."idx_batch_students_user"`);
    await queryRunner.query(`DROP INDEX "public"."idx_batch_students_batch"`);
    await queryRunner.query(`DROP TABLE "batch_students"`);
    await queryRunner.query(`DROP TABLE "batches"`);

    await queryRunner.query(`ALTER TABLE "assignments" DROP COLUMN "duration_minutes"`);
    await queryRunner.query(`ALTER TABLE "assignments" DROP COLUMN "target_type"`);
    await queryRunner.query(`ALTER TABLE "assignments" DROP COLUMN "kind"`);

    await queryRunner.query(`DROP TYPE "public"."assignments_target_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."assignments_kind_enum"`);
  }
}
