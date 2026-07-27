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
  /**
   * Push the LOCAL password digest onto an already-existing Clerk user. OFF by
   * default: overwriting a live Clerk credential is not something a link-only
   * import should ever do silently. Opt in when the Clerk account was created
   * out-of-band (or its password is unknown) and the local hash is the truth.
   */
  syncPassword: boolean;
}

export interface ImportReport {
  imported: number; // created in Clerk WITH the imported password
  linkedExisting: number; // a Clerk user already existed for the email -> linked
  passwordSynced: string[]; // --sync-password: local digest pushed onto an existing user
  fallback: string[]; // created WITHOUT a password (must use reset/magic-link)
  skippedNoOrg: string[]; // imported but org not provisioned in Clerk -> no membership
  errors: { email: string; error: string }[];
}

export function emptyReport(): ImportReport {
  return {
    imported: 0,
    linkedExisting: 0,
    passwordSynced: [],
    fallback: [],
    skippedNoOrg: [],
    errors: [],
  };
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
  const syncPassword = argv.includes('--sync-password');
  const limitArg = argv.find((a) => a.startsWith('--limit='));
  const limitRaw = limitArg ? Number.parseInt(limitArg.split('=')[1], 10) : NaN;
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? limitRaw : undefined;
  return { dryRun, limit, syncPassword };
}

/** Shape of a Clerk API error body (`@clerk/backend` throws these on 4xx). */
interface ClerkApiError {
  status?: number;
  errors?: { code?: string; message?: string; longMessage?: string }[];
  message?: string;
}

/**
 * Flatten a Clerk error into something actionable. Clerk's `.message` is just
 * "Unprocessable Entity" — the reason ("username data doesn't match user
 * requirements set for this instance") lives in `errors[].longMessage`, so a
 * report that logs only `.message` is undiagnosable.
 */
export function clerkErrorDetail(err: unknown): string {
  const e = err as ClerkApiError;
  const details = (e?.errors ?? [])
    .map((d) => [d.code, d.longMessage ?? d.message].filter(Boolean).join(': '))
    .filter(Boolean);
  const status = e?.status ? `${e.status} ` : '';
  return details.length
    ? `${status}${details.join(' | ')}`
    : `${status}${e?.message ?? String(err)}`;
}

/**
 * True when Clerk rejected a create because the instance REQUIRES a username.
 * Instances with "username" as a required field reject any createUser that omits
 * it — including the digest import — with form_data_missing.
 */
export function requiresUsername(err: unknown): boolean {
  const e = err as ClerkApiError;
  return (e?.errors ?? []).some(
    (d) => d.code === 'form_data_missing' && /username/i.test(d.longMessage ?? d.message ?? ''),
  );
}

/**
 * Derive a Clerk username from an email local-part: lowercased, reduced to
 * Clerk's allowed charset, and padded to its 4-char minimum. Deterministic, so a
 * re-run derives the same name instead of minting a second account.
 */
export function usernameFromEmail(email: string): string {
  const local = email.split('@')[0]?.toLowerCase() ?? '';
  const cleaned = local.replace(/[^a-z0-9_-]/g, '') || 'user';
  return cleaned.length >= 4 ? cleaned.slice(0, 64) : `${cleaned}_usr`;
}

export function formatReport(report: ImportReport, dryRun: boolean): string {
  const lines = [
    '',
    `=== argon2 -> Clerk import ${dryRun ? '(DRY RUN — no writes)' : ''} ===`,
    `  imported (with password): ${report.imported}`,
    `  linked to existing Clerk user: ${report.linkedExisting}`,
    `  password synced onto an existing Clerk user: ${report.passwordSynced.length}`,
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
