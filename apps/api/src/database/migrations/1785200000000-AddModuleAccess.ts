import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-role module-toggle overrides table (epic: module-toggles, §5.7/§9.7).
 * Sparse: an empty table means "all code-level defaults". `role` is varchar +
 * CHECK (no PG enum) to avoid future ALTER TYPE churn. Sole owner of
 * `module_access` DDL. Timestamp continues the hand-authored round-epoch
 * convention after 1785100000000 (submission generalization).
 */
export class AddModuleAccess1785200000000 implements MigrationInterface {
  name = 'AddModuleAccess1785200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "module_access" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "module_key" character varying(50) NOT NULL,
        "role" character varying(20) NOT NULL,
        "enabled" boolean NOT NULL,
        CONSTRAINT "PK_module_access" PRIMARY KEY ("id"),
        CONSTRAINT "chk_module_access_role" CHECK ("role" IN ('admin','professor','student'))
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_module_access_key_role" ON "module_access" ("module_key", "role")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."uq_module_access_key_role"`);
    await queryRunner.query(`DROP TABLE "module_access"`);
  }
}
