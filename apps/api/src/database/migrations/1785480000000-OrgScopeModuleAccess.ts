import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #64 (canonical migration #6) — Turns the flat per-role `module_access` table
 * into the two-layer override store of §5.5: a PLATFORM layer (`org_id IS NULL`,
 * SuperAdmin-owned) and an ORG layer (`org_id` set, org-admin-owned).
 *
 * Existing rows backfill to `org_id NULL` (they ARE the platform defaults today),
 * so this is behaviour-preserving until a SuperAdmin sets an org override.
 *
 * TWO PARTIAL UNIQUE INDEXES, not one composite: in Postgres a composite unique
 * on (module_key, role, org_id) does NOT dedupe the platform layer, because every
 * NULL is distinct — two `org_id IS NULL` rows for the same (key, role) would both
 * be allowed and the resolver would pick one arbitrarily. Partial indexes also
 * keep this PG-version-agnostic (NULLS NOT DISTINCT is PG15+).
 *
 * `module_key` widens 50 -> 80 for the dotted feature namespace
 * (`assignments.mcq-crud`), and the role CHECK gains `superadmin` so a platform
 * row can exist for it (the resolver bypasses SuperAdmin, but the DB must not
 * reject a row the console can legitimately write).
 */
export class OrgScopeModuleAccess1785480000000 implements MigrationInterface {
  name = 'OrgScopeModuleAccess1785480000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) Dotted feature keys need the extra width.
    await queryRunner.query(
      `ALTER TABLE "module_access" ALTER COLUMN "module_key" TYPE character varying(80)`,
    );

    // 2) Role CHECK += superadmin (drop-then-add; CHECKs aren't alterable).
    await queryRunner.query(`ALTER TABLE "module_access" DROP CONSTRAINT "chk_module_access_role"`);
    await queryRunner.query(
      `ALTER TABLE "module_access" ADD CONSTRAINT "chk_module_access_role" CHECK ("role" IN ('superadmin','admin','professor','student'))`,
    );

    // 3) The org layer. NULL = platform layer, which is what every existing row is.
    await queryRunner.query(`ALTER TABLE "module_access" ADD COLUMN "org_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "module_access" ADD CONSTRAINT "FK_module_access_organization" ` +
        `FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE`,
    );

    // 4) Replace the flat unique with the two partial uniques.
    await queryRunner.query(`DROP INDEX "public"."uq_module_access_key_role"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_module_access_platform" ON "module_access" ("module_key", "role") WHERE "org_id" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_module_access_org" ON "module_access" ("org_id", "module_key", "role") WHERE "org_id" IS NOT NULL`,
    );
    // The resolver loads one org's overrides at a time (lazy per-org cache).
    await queryRunner.query(
      `CREATE INDEX "idx_module_access_org" ON "module_access" ("org_id") WHERE "org_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Org-layer rows cannot survive the flat unique (they would collide with the
    // platform row for the same key+role), so drop them before restoring it.
    await queryRunner.query(`DELETE FROM "module_access" WHERE "org_id" IS NOT NULL`);
    await queryRunner.query(`DROP INDEX "public"."idx_module_access_org"`);
    await queryRunner.query(`DROP INDEX "public"."uq_module_access_org"`);
    await queryRunner.query(`DROP INDEX "public"."uq_module_access_platform"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_module_access_key_role" ON "module_access" ("module_key", "role")`,
    );
    await queryRunner.query(
      `ALTER TABLE "module_access" DROP CONSTRAINT "FK_module_access_organization"`,
    );
    await queryRunner.query(`ALTER TABLE "module_access" DROP COLUMN "org_id"`);

    // Reverting the role CHECK would fail on any superadmin row — remove those first.
    await queryRunner.query(`DELETE FROM "module_access" WHERE "role" = 'superadmin'`);
    await queryRunner.query(`ALTER TABLE "module_access" DROP CONSTRAINT "chk_module_access_role"`);
    await queryRunner.query(
      `ALTER TABLE "module_access" ADD CONSTRAINT "chk_module_access_role" CHECK ("role" IN ('admin','professor','student'))`,
    );
    // Dotted keys longer than 50 chars would break the narrowing; none can exist
    // while only module keys are written, but be explicit rather than fail late.
    await queryRunner.query(`DELETE FROM "module_access" WHERE length("module_key") > 50`);
    await queryRunner.query(
      `ALTER TABLE "module_access" ALTER COLUMN "module_key" TYPE character varying(50)`,
    );
  }
}
