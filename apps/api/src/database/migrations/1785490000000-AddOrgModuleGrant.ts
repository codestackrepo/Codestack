import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #64 (canonical migration #7) — `org_module_grant`: the SuperAdmin's per-org cap
 * on a module or dotted feature, plus that org's per-role defaults.
 *
 * Two distinct powers in one row (§5.5 layers 2 and 7):
 *   - `granted = false` is a HARD FALSE for the entire org, INCLUDING its admin.
 *     It is the only layer that can gate an org-admin, so it is what makes
 *     "sold/not sold to this tenant" real rather than advisory.
 *   - `role_defaults` jsonb is the weakest layer that still beats code DEFAULTS —
 *     a per-org starting point an org-admin may then override per role.
 *
 * SPARSE, and absent means GRANTED: an org with no rows has every module, so this
 * table stays empty for the common tenant and needs no backfill. `granted`
 * defaults true so a row written only for `role_defaults` does not accidentally
 * revoke the feature.
 */
export class AddOrgModuleGrant1785490000000 implements MigrationInterface {
  name = 'AddOrgModuleGrant1785490000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "org_module_grant" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "feature_key" character varying(80) NOT NULL,
        "granted" boolean NOT NULL DEFAULT true,
        "role_defaults" jsonb,
        CONSTRAINT "PK_org_module_grant" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_org_module_grant_org_feature" ON "org_module_grant" ("organization_id", "feature_key")`,
    );
    await queryRunner.query(
      `ALTER TABLE "org_module_grant" ADD CONSTRAINT "FK_org_module_grant_organization" ` +
        `FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "org_module_grant" DROP CONSTRAINT "FK_org_module_grant_organization"`,
    );
    await queryRunner.query(`DROP INDEX "public"."uq_org_module_grant_org_feature"`);
    await queryRunner.query(`DROP TABLE "org_module_grant"`);
  }
}
