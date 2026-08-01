/**
 * Fixed UUID of the seeded "Legacy University" organization that every
 * pre-multi-tenancy user (and, in later migrations, every org-scoped row) is
 * backfilled into. It is a shared constant — referenced by the AddOrganizations
 * migration and every dependent backfill — so nothing ever resolves the legacy
 * org via a runtime lookup.
 */
export const LEGACY_ORG_ID = '11111111-1111-1111-1111-111111111111';

/**
 * Fixed UUID of the platform-operated "CodeStack Community" organization — the
 * tenant every open-platform member belongs to (#118). Created by migration
 * 1785610000000.
 *
 * A hardcoded constant, for the same reason `LEGACY_ORG_ID` is one: the row is
 * created by a migration, so every environment (including each e2e database, which
 * runs the real migrations) has it at exactly this id, and a compile-time constant
 * cannot fail at runtime the way a slug lookup can. `CommunityOrgService` asserts at
 * boot that the row actually exists, so a missing or renamed row is a loud startup
 * failure rather than a confusing 500 on the first signup.
 */
export const COMMUNITY_ORG_ID = '22222222-2222-2222-2222-222222222222';

/** Slug and display name of the community tenant. Owned by the same migration. */
export const COMMUNITY_ORG_SLUG = 'codestack-community';
export const COMMUNITY_ORG_NAME = 'CodeStack Community';
