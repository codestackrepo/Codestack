import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #66 (canonical migration #8) — `org_quotas`: the numeric sibling of #64's boolean
 * entitlements. Kept in its own sparse table rather than as columns on
 * `organizations` so adding a resource is code-only, and an org with no limits
 * costs no storage and needs no backfill.
 *
 * `limit_value` is NULLABLE and that is load-bearing:
 *   - no row, or `limit_value IS NULL`  => UNLIMITED (the common, free path)
 *   - `limit_value = 0`                 => fully BLOCKED
 * They are different answers, so nothing may coalesce NULL to 0. The CHECK allows
 * 0 precisely so "blocked" is expressible without a second flag column.
 *
 * `resource` is varchar + CHECK (house style, never a PG enum) so a new resource
 * needs no ALTER TYPE — only a widened CHECK.
 *
 * Ordering: this lands AFTER the problem/assignment `organization_id` migrations
 * (#4/#5), because quota counting reads those columns.
 */
export class AddOrgQuotas1785500000000 implements MigrationInterface {
  name = 'AddOrgQuotas1785500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "org_quotas" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "resource" character varying(40) NOT NULL,
        "limit_value" integer,
        CONSTRAINT "PK_org_quotas" PRIMARY KEY ("id"),
        CONSTRAINT "chk_org_quotas_resource" CHECK ("resource" IN ('max_users','max_problems','max_assignments')),
        CONSTRAINT "chk_org_quotas_limit_non_negative" CHECK ("limit_value" IS NULL OR "limit_value" >= 0)
      )
    `);
    // The enforcement path looks up exactly one (org, resource) row and takes a
    // row lock on it, so this unique index is also its access path.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_org_quotas_org_resource" ON "org_quotas" ("organization_id", "resource")`,
    );
    await queryRunner.query(
      `ALTER TABLE "org_quotas" ADD CONSTRAINT "FK_org_quotas_organization" ` +
        `FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "org_quotas" DROP CONSTRAINT "FK_org_quotas_organization"`,
    );
    await queryRunner.query(`DROP INDEX "public"."uq_org_quotas_org_resource"`);
    await queryRunner.query(`DROP TABLE "org_quotas"`);
  }
}
