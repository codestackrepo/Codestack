import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #101 (canonical migration #9) — removes the Clerk identity linkage added by
 * 1785460000000 (users) and 1785400000000 (organizations). Clerk is no longer an
 * auth provider or the organization authority: the app runs on local email +
 * password, so neither column has a reader left after #102.
 *
 * `users.password_hash` deliberately stays NULLABLE. 1785460000000 dropped its
 * NOT NULL for Clerk-managed accounts, and re-adding it here would be wrong for a
 * different reason: an invited-but-not-yet-accepted account is created with no
 * password at all, and the invite engine sets one at acceptance.
 *
 * NOTE — UNRECOVERABLE: `down()` restores STRUCTURE ONLY. Every
 * `users.clerk_user_id` and `organizations.clerk_org_id` VALUE is destroyed and
 * cannot be recomputed from anything left in this database — re-linking would
 * mean re-reading the Clerk API. Acceptable because no real Clerk accounts were
 * ever provisioned against this deployment.
 *
 * NOTE — DEPLOY ORDER: this is migrate-AFTER-restart, not migrate-then-restart.
 * `user.entity.ts` and `organization.entity.ts` enumerate every mapped column in
 * each SELECT they build, so a pod still carrying the entity fields gets 42703 on
 * ALL user and organization reads — not merely the Clerk paths. The entity fields
 * come off in the same release (#102).
 */
export class DropClerkIntegration1785510000000 implements MigrationInterface {
  name = 'DropClerkIntegration1785510000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_user_clerk_user_id"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "clerk_user_id"`);

    await queryRunner.query(`DROP INDEX "public"."uq_organizations_clerk_org_id"`);
    await queryRunner.query(`ALTER TABLE "organizations" DROP COLUMN "clerk_org_id"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Structure only — see the UNRECOVERABLE note above. Both columns come back
    // all-NULL, which the partial-unique indexes tolerate by construction.
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD COLUMN "clerk_org_id" character varying(120)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_organizations_clerk_org_id" ON "organizations" ("clerk_org_id") WHERE "clerk_org_id" IS NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "clerk_user_id" character varying(255)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_user_clerk_user_id" ON "users" ("clerk_user_id") WHERE "clerk_user_id" IS NOT NULL`,
    );
  }
}
