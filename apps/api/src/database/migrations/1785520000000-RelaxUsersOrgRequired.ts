import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #101 (canonical migration #10) — lets a STUDENT hold `organization_id IS NULL`.
 *
 * Self-registration has no organization to stamp: a student signs up, sits in a
 * confined holding state, and is either assigned to an org by staff or claims an
 * invite. Until now `chk_users_org_required` ("superadmin OR org IS NOT NULL")
 * forbade exactly that row, which is why `POST /auth/register` cannot succeed
 * today — the only path that ever produced a legal signup was Clerk's
 * LEGACY_ORG_ID fallback, and #102 deletes it. This migration therefore lands
 * BEFORE the excision, not after.
 *
 * The constraint is rewritten in CASE form, deliberately NOT as the obvious
 * disjunction:
 *
 *     ("role" = 'superadmin' AND org IS NULL) OR "role" = 'student' OR org IS NOT NULL
 *
 * That third arm re-admits an ORG-CARRYING SUPERADMIN — precisely the state the
 * constraint exists to forbid, and the state the `POST`/`PATCH /users`
 * escalation (#105) could plant. A CASE has exactly one live arm per row, so
 * 'superadmin' can only ever be tested against `org IS NULL`.
 *
 * The `UPDATE` is a HEAL, not a demote. An org-carrying superadmin can only be an
 * artifact of that escalation bug, and rewriting them to `role = 'admin'` would
 * legitimise them inside whichever tenant they were planted in — so they are
 * deactivated and left for a human to triage.
 *
 * NOTE — NOT SYMMETRIC: the `is_active` heal is not reverted. `up()` cannot record
 * which of those rows were already inactive, so `down()` would have to guess.
 *
 * NOTE — `down()` FAILS LOUD (23514) once any org-less student exists, and that is
 * intended: sweeping real people into LEGACY_ORG_ID would misattribute them to a
 * tenant nobody chose. The escape hatch is explicit and destructive — run
 *
 *     DELETE FROM "users" WHERE "organization_id" IS NULL AND "role" = 'student';
 *
 * (which cascades to their gamification/submission rows) before reverting.
 */
export class RelaxUsersOrgRequired1785520000000 implements MigrationInterface {
  name = 'RelaxUsersOrgRequired1785520000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Heal any escalation artifact BEFORE the stricter superadmin arm goes on,
    // otherwise the ADD CONSTRAINT itself fails 23514 on those rows.
    await queryRunner.query(
      `UPDATE "users" SET "is_active" = false WHERE "role" = 'superadmin' AND "organization_id" IS NOT NULL`,
    );

    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "chk_users_org_required"`);
    await queryRunner.query(`
      ALTER TABLE "users" ADD CONSTRAINT "chk_users_org_required" CHECK (
        CASE "role"
          WHEN 'superadmin' THEN "organization_id" IS NULL
          WHEN 'student'    THEN TRUE
          ELSE "organization_id" IS NOT NULL
        END)
    `);

    // The unassigned pool is read newest-first and is expected to stay small
    // relative to `users`, so a partial index on the ordering column is both the
    // filter and the sort. Predicate matches GET /users/unassigned exactly (#105):
    // an orphaned STAFF row must never surface there and be claimed at its
    // elevated role.
    await queryRunner.query(
      `CREATE INDEX "idx_user_unassigned" ON "users" ("created_at" DESC) WHERE "organization_id" IS NULL AND "role" = 'student'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_user_unassigned"`);
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "chk_users_org_required"`);
    // Restores 1785400000000's constraint verbatim. Raises 23514 if any org-less
    // student survives — see the FAILS LOUD note above for the escape hatch.
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "chk_users_org_required" CHECK ("role" = 'superadmin' OR "organization_id" IS NOT NULL)`,
    );
  }
}
