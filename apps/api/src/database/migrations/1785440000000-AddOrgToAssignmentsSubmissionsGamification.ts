import { MigrationInterface, QueryRunner } from 'typeorm';
import { LEGACY_ORG_ID } from '../../modules/organizations/organizations.constants';

/**
 * #58 — Denormalizes organization_id (NOT NULL) onto assignments, submissions,
 * and user_gamification so tenant-scoped reads (scopeToOrg) never join back to
 * classrooms/users. Each table: ADD nullable -> backfill via the row's natural
 * link -> LEGACY_ORG_ID safety net for orphans (users.organization_id is NULLABLE
 * for SUPERADMIN, so the net is required before SET NOT NULL) -> SET NOT NULL ->
 * FK to organizations ON DELETE RESTRICT -> index.
 *
 * Backfill links:
 *   assignments        <- classrooms.organization_id via assignments.classroom_id
 *   submissions        <- users.organization_id      via submissions.user_id
 *   user_gamification  <- users.organization_id      via user_gamification.user_id
 *
 * Depends on AddOrganizations (1785400000000) + AddOrgToClassrooms (1785420000000).
 * NOTE: second DDL writer on `submissions` (after GeneralizeSubmissionTarget
 * 1785100000000). Deploy this migration together with the org-stamping code
 * (migrate-then-restart) so no old pod inserts a NULL org after SET NOT NULL.
 */
export class AddOrgToAssignmentsSubmissionsGamification1785440000000
  implements MigrationInterface
{
  name = 'AddOrgToAssignmentsSubmissionsGamification1785440000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ===================== assignments (via classroom) =====================
    await queryRunner.query(`ALTER TABLE "assignments" ADD COLUMN "organization_id" uuid`);
    await queryRunner.query(
      `UPDATE "assignments" a SET "organization_id" = c."organization_id" FROM "classrooms" c WHERE c."id" = a."classroom_id"`,
    );
    await queryRunner.query(
      `UPDATE "assignments" SET "organization_id" = $1 WHERE "organization_id" IS NULL`,
      [LEGACY_ORG_ID],
    );
    await queryRunner.query(`ALTER TABLE "assignments" ALTER COLUMN "organization_id" SET NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "assignments" ADD CONSTRAINT "FK_assignments_organization" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_assignment_organization" ON "assignments" ("organization_id")`,
    );

    // ===================== submissions (via owner user) =====================
    await queryRunner.query(`ALTER TABLE "submissions" ADD COLUMN "organization_id" uuid`);
    await queryRunner.query(
      `UPDATE "submissions" s SET "organization_id" = u."organization_id" FROM "users" u WHERE u."id" = s."user_id"`,
    );
    // users.organization_id is NULL for SUPERADMIN — map those submissions to legacy.
    await queryRunner.query(
      `UPDATE "submissions" SET "organization_id" = $1 WHERE "organization_id" IS NULL`,
      [LEGACY_ORG_ID],
    );
    await queryRunner.query(`ALTER TABLE "submissions" ALTER COLUMN "organization_id" SET NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "submissions" ADD CONSTRAINT "FK_submissions_organization" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_submission_organization" ON "submissions" ("organization_id")`,
    );

    // ===================== user_gamification (via user) =====================
    await queryRunner.query(`ALTER TABLE "user_gamification" ADD COLUMN "organization_id" uuid`);
    await queryRunner.query(
      `UPDATE "user_gamification" g SET "organization_id" = u."organization_id" FROM "users" u WHERE u."id" = g."user_id"`,
    );
    await queryRunner.query(
      `UPDATE "user_gamification" SET "organization_id" = $1 WHERE "organization_id" IS NULL`,
      [LEGACY_ORG_ID],
    );
    await queryRunner.query(
      `ALTER TABLE "user_gamification" ALTER COLUMN "organization_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_gamification" ADD CONSTRAINT "FK_user_gamification_organization" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_user_gamification_organization" ON "user_gamification" ("organization_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Mirror image, reverse table order.
    await queryRunner.query(`DROP INDEX "public"."idx_user_gamification_organization"`);
    await queryRunner.query(
      `ALTER TABLE "user_gamification" DROP CONSTRAINT "FK_user_gamification_organization"`,
    );
    await queryRunner.query(`ALTER TABLE "user_gamification" DROP COLUMN "organization_id"`);

    await queryRunner.query(`DROP INDEX "public"."idx_submission_organization"`);
    await queryRunner.query(
      `ALTER TABLE "submissions" DROP CONSTRAINT "FK_submissions_organization"`,
    );
    await queryRunner.query(`ALTER TABLE "submissions" DROP COLUMN "organization_id"`);

    await queryRunner.query(`DROP INDEX "public"."idx_assignment_organization"`);
    await queryRunner.query(
      `ALTER TABLE "assignments" DROP CONSTRAINT "FK_assignments_organization"`,
    );
    await queryRunner.query(`ALTER TABLE "assignments" DROP COLUMN "organization_id"`);
  }
}
