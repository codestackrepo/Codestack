import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #118 (canonical migration #20) — per-role seat caps.
 *
 * A superadmin approving an organization sets how many professors and how many
 * students it may hold, so `org_quotas.resource` needs two new values. The enum's own
 * comment mandates this shape: "adding one means widening that CHECK in a migration,
 * but never an ALTER TYPE" — `resource` is varchar + CHECK precisely so this is a
 * cheap constraint swap rather than a type rewrite.
 *
 * These caps are ADDITIVE to `max_users`, not a replacement. Every seat-creating path
 * asserts the total and the role's own cap, so a tenant cannot exceed its overall
 * seat count by rebalancing between roles.
 *
 * NO backfill, and that is the correct default rather than an omission: an absent
 * `org_quotas` row means UNLIMITED under the existing semantics, so every organization
 * that predates this migration keeps exactly the behaviour it has today. Inserting
 * rows here would silently impose a cap on tenants nobody agreed one with. New
 * organizations get their caps written at approval time, where a human chose them.
 *
 * ADMIN is deliberately not represented. Admins are charged to `max_users` only —
 * see `seatResourceFor` for why folding them into the professor cap would make the
 * approval form's "professors: N" field mean something other than what it says.
 *
 * NOTE — `down()` DELETES any per-role rows before narrowing the CHECK, because the
 * constraint could not otherwise be re-added. That is lossy: the caps a superadmin
 * chose are gone and re-running `up()` cannot recover them. It is nonetheless the
 * right revert — leaving orphan rows that violate the restored CHECK would make the
 * table unwritable — and it is safe in the sense that deleting a quota row means
 * "unlimited", so no tenant becomes MORE restricted by the rollback.
 */
export class AddPerRoleSeatQuotas1785620000000 implements MigrationInterface {
  name = 'AddPerRoleSeatQuotas1785620000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "org_quotas" DROP CONSTRAINT "chk_org_quotas_resource"`);
    await queryRunner.query(
      `ALTER TABLE "org_quotas" ADD CONSTRAINT "chk_org_quotas_resource" CHECK ("resource" IN ` +
        `('max_users','max_problems','max_assignments','max_professors','max_students'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Must precede the narrower CHECK, or ADD CONSTRAINT fails 23514 on these rows.
    await queryRunner.query(
      `DELETE FROM "org_quotas" WHERE "resource" IN ('max_professors','max_students')`,
    );
    await queryRunner.query(`ALTER TABLE "org_quotas" DROP CONSTRAINT "chk_org_quotas_resource"`);
    await queryRunner.query(
      `ALTER TABLE "org_quotas" ADD CONSTRAINT "chk_org_quotas_resource" CHECK ("resource" IN ` +
        `('max_users','max_problems','max_assignments'))`,
    );
  }
}
