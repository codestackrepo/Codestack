/**
 * Fixed UUID of the seeded "Legacy University" organization that every
 * pre-multi-tenancy user (and, in later migrations, every org-scoped row) is
 * backfilled into. It is a shared constant — referenced by the AddOrganizations
 * migration and every dependent backfill — so nothing ever resolves the legacy
 * org via a runtime lookup.
 */
export const LEGACY_ORG_ID = '11111111-1111-1111-1111-111111111111';
