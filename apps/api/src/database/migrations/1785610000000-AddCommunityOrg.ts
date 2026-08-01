import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  COMMUNITY_ORG_ID,
  COMMUNITY_ORG_NAME,
  COMMUNITY_ORG_SLUG,
} from '../../modules/organizations/organizations.constants';

/**
 * #118 (canonical migration #19) — the platform-operated community tenant.
 *
 * Open-platform members need somewhere to live. The alternative — leaving them
 * org-less — was rejected because `chk_users_org_required` (1785520000000) permits
 * `organization_id IS NULL` only for a superadmin and a student, so an open
 * PROFESSOR would be forbidden outright; and because `TenantContextGuard` confines
 * every org-less non-superadmin to the handful of `@AllowsUnassigned` routes, which
 * would leave an open user able to do essentially nothing. Making them members of a
 * real tenant means every org-scoped feature, quota and invite path keeps working
 * with no special case and no constraint surgery.
 *
 * Created HERE rather than by a seed, deliberately. Seeds are optional and
 * per-environment; migrations are mandatory and run everywhere, including each e2e
 * database. Anything that resolves this row at runtime — and self-signup does, on
 * every request — must never have to wonder whether someone remembered to seed.
 *
 * `type = 'community'` needs the CHECK widened first. That CHECK is dropped and
 * re-added rather than altered because Postgres has no ALTER CONSTRAINT for a check
 * expression; the table is small and the window is brief.
 *
 * `settings` stays `{}`: this tenant must NEVER carry branding. It is the one org
 * whose members are strangers to each other, and a co-branded "you are part of
 * CodeStack Community" lockup would misrepresent it as an institution they joined.
 * The frontend treats `type === 'community'` as the "render plain" signal.
 *
 * No `org_quotas` rows either, which means unlimited by the existing
 * absent-row-is-unlimited semantics. That is intentional: open signup is the growth
 * path and capping it would be capping the funnel, not protecting a customer.
 *
 * NOTE — `down()` FAILS LOUD if anyone is still in the tenant, matching
 * `RelaxUsersOrgRequired.down()`'s stance. Deleting a tenant out from under live
 * members would either orphan them against the org FK or, worse, silently
 * reassign real people. The escape hatch is explicit and destructive, and stated
 * below rather than performed.
 */
export class AddCommunityOrg1785610000000 implements MigrationInterface {
  name = 'AddCommunityOrg1785610000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "organizations" DROP CONSTRAINT "chk_organizations_type"`);
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD CONSTRAINT "chk_organizations_type" ` +
        `CHECK ("type" IN ('university','organization','community'))`,
    );

    // Idempotent on BOTH unique keys. `uq_organizations_slug` is the real unique
    // index, but the id is a fixed constant too, so a partially-applied environment
    // could collide on either — and a migration that throws on re-entry is a
    // migration someone will disable.
    await queryRunner.query(
      `INSERT INTO "organizations" ("id", "name", "slug", "type", "status", "settings", "created_by_id")
         VALUES ($1, $2, $3, 'community', 'active', '{}'::jsonb, NULL)
       ON CONFLICT DO NOTHING`,
      [COMMUNITY_ORG_ID, COMMUNITY_ORG_NAME, COMMUNITY_ORG_SLUG],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const blockers = (await queryRunner.query(
      `SELECT
         (SELECT count(*) FROM "users" WHERE "organization_id" = $1) AS users,
         (SELECT count(*) FROM "org_invites" WHERE "organization_id" = $1) AS invites`,
      [COMMUNITY_ORG_ID],
    )) as Array<{ users: string; invites: string }>;

    const users = Number(blockers[0]?.users ?? 0);
    const invites = Number(blockers[0]?.invites ?? 0);
    if (users > 0 || invites > 0) {
      throw new Error(
        `Refusing to remove the community organization: ${users} user(s) and ${invites} invite(s) ` +
          `still reference it. Reverting would orphan or misattribute real accounts. To proceed ` +
          `deliberately, first move or delete those rows — e.g. reassign the users to a real ` +
          `organization — then re-run this revert.`,
      );
    }

    await queryRunner.query(`DELETE FROM "organizations" WHERE "id" = $1`, [COMMUNITY_ORG_ID]);
    await queryRunner.query(`ALTER TABLE "organizations" DROP CONSTRAINT "chk_organizations_type"`);
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD CONSTRAINT "chk_organizations_type" ` +
        `CHECK ("type" IN ('university','organization'))`,
    );
  }
}
