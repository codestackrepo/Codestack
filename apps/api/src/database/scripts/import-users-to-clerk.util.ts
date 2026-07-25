import { Role } from '../../common/enums/role.enum';

/**
 * Pure helpers for the argon2 -> Clerk password import (#53). Extracted so the
 * mapping/detection/reporting logic is unit-tested without a live Clerk or DB.
 */

export interface ImportArgs {
  /** Report only — no Clerk calls, no DB writes. */
  dryRun: boolean;
  /** Cap the number of users processed (for a staged rollout). */
  limit?: number;
}

export interface ImportReport {
  imported: number; // created in Clerk WITH the imported password
  linkedExisting: number; // a Clerk user already existed for the email -> linked
  fallback: string[]; // created WITHOUT a password (must use reset/magic-link)
  skippedNoOrg: string[]; // imported but org not provisioned in Clerk -> no membership
  errors: { email: string; error: string }[];
}

export function emptyReport(): ImportReport {
  return { imported: 0, linkedExisting: 0, fallback: [], skippedNoOrg: [], errors: [] };
}

/**
 * Map a local password hash to the Clerk `passwordHasher` value, read straight
 * from the PHC/modular-crypt prefix. Returns null when the hash can't be imported
 * (unknown scheme) -> that user falls back to a Clerk reset/magic-link.
 */
export function detectHasher(hash: string | null): string | null {
  if (!hash) return null;
  if (hash.startsWith('$argon2id$')) return 'argon2id';
  if (hash.startsWith('$argon2i$')) return 'argon2i';
  if (hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$'))
    return 'bcrypt';
  return null;
}

/**
 * Map a local Role to the Clerk ORG role used when adding the user to their org.
 * SUPERADMIN has no org membership (null). The custom `org:professor` role must
 * exist in the Clerk instance; it is the inverse of #52's mapClerkOrgRole.
 */
export function clerkOrgRoleForRole(role: Role): string | null {
  switch (role) {
    case Role.SUPERADMIN:
      return null;
    case Role.ADMIN:
      return 'org:admin';
    case Role.PROFESSOR:
      return 'org:professor';
    default:
      return 'org:member';
  }
}

export function parseArgs(argv: string[]): ImportArgs {
  const dryRun = argv.includes('--dry-run');
  const limitArg = argv.find((a) => a.startsWith('--limit='));
  const limitRaw = limitArg ? Number.parseInt(limitArg.split('=')[1], 10) : NaN;
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? limitRaw : undefined;
  return { dryRun, limit };
}

export function formatReport(report: ImportReport, dryRun: boolean): string {
  const lines = [
    '',
    `=== argon2 -> Clerk import ${dryRun ? '(DRY RUN — no writes)' : ''} ===`,
    `  imported (with password): ${report.imported}`,
    `  linked to existing Clerk user: ${report.linkedExisting}`,
    `  fell back to reset/magic-link: ${report.fallback.length}`,
    `  imported but org not in Clerk (no membership): ${report.skippedNoOrg.length}`,
    `  errors: ${report.errors.length}`,
  ];
  if (report.fallback.length) {
    lines.push('', '  -- users needing a password reset --');
    report.fallback.forEach((e) => lines.push(`     ${e}`));
  }
  if (report.skippedNoOrg.length) {
    lines.push(
      '',
      '  -- imported without org membership (provision the Clerk org, then re-run) --',
    );
    report.skippedNoOrg.forEach((e) => lines.push(`     ${e}`));
  }
  if (report.errors.length) {
    lines.push('', '  -- errors --');
    report.errors.forEach(({ email, error }) => lines.push(`     ${email}: ${error}`));
  }
  return lines.join('\n');
}
