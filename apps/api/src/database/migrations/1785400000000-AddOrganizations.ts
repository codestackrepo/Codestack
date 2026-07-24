import { MigrationInterface, QueryRunner } from 'typeorm';
import { LEGACY_ORG_ID } from '../../modules/organizations/organizations.constants';

/**
 * Multi-tenancy foundation (#48, PLATFORM-PLAN §5.1 / §7 #1).
 *
 * - Creates the `organizations` tenant root (varchar+CHECK discriminators, no
 *   quota columns — quotas are a separate sparse table, #66).
 * - Converts `users.role` from the PG enum to varchar+CHECK, adding 'superadmin'
 *   (follows the NotificationTypeToVarchar precedent — avoids non-transactional
 *   ALTER TYPE ADD VALUE churn and keeps the RBAC value set editable).
 * - Adds `users.organization_id` (FK, ON DELETE RESTRICT), seeds a single
 *   "Legacy University" org with a fixed UUID, and backfills every existing user
 *   into it. `chk_users_org_required` enforces "every non-superadmin has an org".
 *
 * Timestamp continues the hand-authored round-epoch convention after
 * 1785300000000 (AddGamification). First migration of the platform sequence.
 */
export class AddOrganizations1785400000000 implements MigrationInterface {
  name = 'AddOrganizations1785400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. organizations tenant root
    await queryRunner.query(`
      CREATE TABLE "organizations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "name" character varying(200) NOT NULL,
        "slug" character varying(80) NOT NULL,
        "type" character varying(20) NOT NULL DEFAULT 'university',
        "status" character varying(20) NOT NULL DEFAULT 'active',
        "clerk_org_id" character varying(120),
        "settings" jsonb NOT NULL DEFAULT '{}',
        "created_by_id" uuid,
        CONSTRAINT "PK_organizations" PRIMARY KEY ("id"),
        CONSTRAINT "chk_organizations_type" CHECK ("type" IN ('university','organization')),
        CONSTRAINT "chk_organizations_status" CHECK ("status" IN ('active','suspended'))
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_organizations_slug" ON "organizations" ("slug")`,
    );
    // clerk_org_id is unique only when present (an org may exist pre-provisioning).
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_organizations_clerk_org_id" ON "organizations" ("clerk_org_id") WHERE "clerk_org_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD CONSTRAINT "FK_organizations_created_by" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL`,
    );

    // 2. seed the single legacy org (fixed UUID shared with the backfills)
    await queryRunner.query(
      `INSERT INTO "organizations" ("id","name","slug","type","status") VALUES ($1,'Legacy University','legacy','university','active')`,
      [LEGACY_ORG_ID],
    );

    // 3. users.role: PG enum -> varchar(20)+CHECK (incl 'superadmin')
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" TYPE character varying(20) USING "role"::text`,
    );
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'student'`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "chk_users_role" CHECK ("role" IN ('superadmin','admin','professor','student'))`,
    );
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);

    // 4. users.organization_id + backfill + FK + index + required-CHECK
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "organization_id" uuid`);
    await queryRunner.query(
      `UPDATE "users" SET "organization_id" = $1 WHERE "organization_id" IS NULL`,
      [LEGACY_ORG_ID],
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_users_organization" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_user_organization" ON "users" ("organization_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "chk_users_org_required" CHECK ("role" = 'superadmin' OR "organization_id" IS NOT NULL)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 4. users.organization_id
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "chk_users_org_required"`);
    await queryRunner.query(`DROP INDEX "public"."idx_user_organization"`);
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_users_organization"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "organization_id"`);

    // 3. users.role: varchar -> PG enum. NOTE: any 'superadmin' row would break
    // the USING cast — safe here because this migration never creates one.
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "chk_users_role"`);
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('admin','professor','student')`,
    );
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" TYPE "public"."users_role_enum" USING "role"::"public"."users_role_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'student'`);

    // 1-2. organizations
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP CONSTRAINT "FK_organizations_created_by"`,
    );
    await queryRunner.query(`DROP INDEX "public"."uq_organizations_clerk_org_id"`);
    await queryRunner.query(`DROP INDEX "public"."uq_organizations_slug"`);
    await queryRunner.query(`DROP TABLE "organizations"`);
  }
}
