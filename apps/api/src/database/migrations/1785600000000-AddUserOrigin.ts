import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #118 (canonical migration #18) — `users.origin`.
 *
 * Records HOW an account came into existence, permanently. It is deliberately not
 * the same question as "which organization is this user in", which changes over
 * time: an open-platform student who later accepts a university invite is a member
 * of that university and still, historically, a self-signup. One column cannot
 * answer both, so this one answers only the first and the org FK answers the second.
 *
 * `NOT NULL DEFAULT 'closed'` is metadata-only on PG >= 11 (no table rewrite), and
 * 'closed' is the right default for every row that already exists: before this
 * migration the only way to obtain an account was an invite or staff creation, both
 * of which are somebody-vouched-for-you.
 *
 * The backfill then corrects the one pre-existing exception. `organization_id IS
 * NULL AND role = 'student'` is exactly the shape `RelaxUsersOrgRequired`
 * (1785520000000) created for self-registration — the confined holding state — so
 * those rows are self-signups and are marked 'open'. The predicate deliberately
 * mirrors that migration's `idx_user_unassigned` rather than being a looser
 * `organization_id IS NULL`: a superadmin is also org-less and must stay 'closed',
 * since the platform operator is not a self-signup.
 *
 * NOT a CHECK against role or org. It is tempting to constrain "open implies
 * student-or-professor", but the open platform's whole point is that an open user can
 * later be invited into a tenant at any role, and an over-tight CHECK here would
 * reject that legitimate transition at the worst possible moment.
 *
 * NOTE — `down()` drops the column and loses provenance irrecoverably. Re-running
 * `up()` would re-derive it from the org/role shape, which is only correct for rows
 * that have not moved since; anyone who joined a tenant in the meantime would come
 * back as 'closed'. Stated because it is a one-way door in the information sense
 * even though it is mechanically reversible.
 */
export class AddUserOrigin1785600000000 implements MigrationInterface {
  name = 'AddUserOrigin1785600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "origin" character varying(20) NOT NULL DEFAULT 'closed'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "chk_users_origin" CHECK ("origin" IN ('closed','open'))`,
    );

    // The pre-existing self-registrants. Same predicate as idx_user_unassigned.
    await queryRunner.query(
      `UPDATE "users" SET "origin" = 'open' WHERE "organization_id" IS NULL AND "role" = 'student'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "chk_users_origin"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "origin"`);
  }
}
