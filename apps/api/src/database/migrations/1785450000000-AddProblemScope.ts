import { MigrationInterface, QueryRunner } from 'typeorm';
import { LEGACY_ORG_ID } from '../../modules/organizations/organizations.constants';

/**
 * #56 — Adds the GLOBAL-vs-ORG scope discriminator to `problems` alongside a
 * nullable tenant `organization_id`. `scope` follows the varchar+CHECK house
 * style (NOT a PG enum); the existing `visibility` PG enum (private|shared) is
 * left untouched and keeps meaning intra-org sharing.
 *
 * Invariant (chk_problem_scope_org): a global problem has NO org; an org problem
 * MUST have one. Added AFTER the backfill so it can never fail mid-run.
 *
 * Backfill (single-tenant pre-migration, so this heuristic is exact for the real
 * data state):
 *   - de-facto seed catalog = admin/superadmin-authored SHARED problems -> global, org NULL
 *   - everything else -> scope='org', org = COALESCE(author's org, LEGACY_ORG_ID)
 *     (author may be NULL via ON DELETE SET NULL, or a superadmin with NULL org)
 *
 * Deploy migrate-then-restart with the #56 stamping code + seed-catalog edit so
 * no pod inserts a scope='org'/org=NULL row that violates the CHECK.
 */
export class AddProblemScope1785450000000 implements MigrationInterface {
  name = 'AddProblemScope1785450000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) Columns. scope defaults to 'org' so every existing row starts org-scoped.
    await queryRunner.query(
      `ALTER TABLE "problems" ADD COLUMN "scope" character varying(16) NOT NULL DEFAULT 'org'`,
    );
    await queryRunner.query(`ALTER TABLE "problems" ADD COLUMN "organization_id" uuid`);

    // 2) Value CHECK for the discriminator (enum-as-varchar house style).
    await queryRunner.query(
      `ALTER TABLE "problems" ADD CONSTRAINT "chk_problem_scope" CHECK ("scope" IN ('global', 'org'))`,
    );

    // 3) Backfill: promote admin/superadmin-authored SHARED problems to global.
    await queryRunner.query(
      `UPDATE "problems" p SET "scope" = 'global', "organization_id" = NULL
         FROM "users" u
        WHERE u."id" = p."created_by_id"
          AND p."visibility" = 'shared'
          AND u."role" IN ('admin', 'superadmin')`,
    );

    // 4) Backfill: every remaining (org) problem gets the author's org, or LEGACY
    //    when the author is NULL / org-less (superadmin).
    await queryRunner.query(
      `UPDATE "problems" SET "organization_id" = COALESCE(
         (SELECT u."organization_id" FROM "users" u WHERE u."id" = "problems"."created_by_id"),
         $1)
       WHERE "scope" = 'org'`,
      [LEGACY_ORG_ID],
    );

    // 5) Invariant CHECK (safe now that the backfill guarantees it).
    await queryRunner.query(
      `ALTER TABLE "problems" ADD CONSTRAINT "chk_problem_scope_org" CHECK (
         ("scope" = 'global' AND "organization_id" IS NULL)
         OR ("scope" = 'org' AND "organization_id" IS NOT NULL))`,
    );

    // 6) Nullable FK (global rows are NULL and unchecked) + indexes.
    await queryRunner.query(
      `ALTER TABLE "problems" ADD CONSTRAINT "FK_problems_organization" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT`,
    );
    await queryRunner.query(`CREATE INDEX "idx_problem_scope" ON "problems" ("scope")`);
    await queryRunner.query(
      `CREATE INDEX "idx_problem_organization" ON "problems" ("organization_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_problem_organization"`);
    await queryRunner.query(`DROP INDEX "public"."idx_problem_scope"`);
    await queryRunner.query(`ALTER TABLE "problems" DROP CONSTRAINT "FK_problems_organization"`);
    await queryRunner.query(`ALTER TABLE "problems" DROP CONSTRAINT "chk_problem_scope_org"`);
    await queryRunner.query(`ALTER TABLE "problems" DROP CONSTRAINT "chk_problem_scope"`);
    await queryRunner.query(`ALTER TABLE "problems" DROP COLUMN "organization_id"`);
    await queryRunner.query(`ALTER TABLE "problems" DROP COLUMN "scope"`);
  }
}
