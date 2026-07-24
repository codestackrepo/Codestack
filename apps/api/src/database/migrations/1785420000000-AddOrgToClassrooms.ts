import { MigrationInterface, QueryRunner } from 'typeorm';
import { LEGACY_ORG_ID } from '../../modules/organizations/organizations.constants';

/**
 * Org-scopes classrooms (#55, PLATFORM-PLAN §7 #3). Adds classrooms.organization_id
 * (backfilled from the creator's org), and reshapes the two GLOBAL unique
 * constraints (course_id, title) into composite (organization_id, …) uniques so
 * two universities can each own a course with the same code/title.
 *
 * Depends on AddOrganizations (1785400000000) — FKs organizations + reads
 * users.organization_id.
 */
export class AddOrgToClassrooms1785420000000 implements MigrationInterface {
  name = 'AddOrgToClassrooms1785420000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. add + backfill organization_id (from the creator's org)
    await queryRunner.query(`ALTER TABLE "classrooms" ADD COLUMN "organization_id" uuid`);
    await queryRunner.query(
      `UPDATE "classrooms" c SET "organization_id" = u."organization_id" FROM "users" u WHERE u."id" = c."created_by_id"`,
    );
    // safety net for any classroom whose creator somehow lacks an org
    await queryRunner.query(
      `UPDATE "classrooms" SET "organization_id" = $1 WHERE "organization_id" IS NULL`,
      [LEGACY_ORG_ID],
    );
    await queryRunner.query(`ALTER TABLE "classrooms" ALTER COLUMN "organization_id" SET NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "classrooms" ADD CONSTRAINT "FK_classrooms_organization" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_classroom_organization" ON "classrooms" ("organization_id")`,
    );

    // 2. global uniques -> composite (org, …)
    await queryRunner.query(
      `ALTER TABLE "classrooms" DROP CONSTRAINT "UQ_095f3e74ed049798ba312a62927"`, // course_id
    );
    await queryRunner.query(
      `ALTER TABLE "classrooms" DROP CONSTRAINT "UQ_d4ba2e72211c9f814cb3562ffb6"`, // title
    );
    await queryRunner.query(`DROP INDEX "public"."idx_classroom_course_id"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_classroom_org_course" ON "classrooms" ("organization_id", "course_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_classroom_org_title" ON "classrooms" ("organization_id", "title")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 2. composite -> global uniques (safe: single org today, so no cross-org dupes)
    await queryRunner.query(`DROP INDEX "public"."uq_classroom_org_title"`);
    await queryRunner.query(`DROP INDEX "public"."uq_classroom_org_course"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_classroom_course_id" ON "classrooms" ("course_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "classrooms" ADD CONSTRAINT "UQ_095f3e74ed049798ba312a62927" UNIQUE ("course_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "classrooms" ADD CONSTRAINT "UQ_d4ba2e72211c9f814cb3562ffb6" UNIQUE ("title")`,
    );

    // 1. drop organization_id
    await queryRunner.query(`DROP INDEX "public"."idx_classroom_organization"`);
    await queryRunner.query(
      `ALTER TABLE "classrooms" DROP CONSTRAINT "FK_classrooms_organization"`,
    );
    await queryRunner.query(`ALTER TABLE "classrooms" DROP COLUMN "organization_id"`);
  }
}
