/**
 * Slug generation for an approved organization (#118).
 *
 * The superadmin does not type it: they approve an application, and the slug is
 * derived from the organization's own name. That choice trades a little control for
 * one fewer field on a form that already asks for two seat counts and an admin
 * address, and the generated value is shown back on the approved application so it is
 * never a surprise.
 *
 * `organizations.slug` is varchar(80) with a UNIQUE index, and both of those shape
 * this file: the length cap is applied BEFORE any collision suffix (so a suffix can
 * never push the value over the column limit), and the unique index — not a
 * pre-flight SELECT — is what actually arbitrates collisions.
 */

/** Matches the column width in 1785400000000. Suffixes are reserved out of this. */
export const SLUG_MAX_LENGTH = 80;

/**
 * Room kept for a `-NN` collision suffix, so `slugify` can truncate once and the
 * retry loop never has to re-truncate (which would change the base mid-sequence and
 * could produce a slug it had already tried).
 */
const SUFFIX_RESERVE = 4;

/**
 * Fallback base for a name that slugifies to nothing.
 *
 * Not hypothetical for this product: an organization named entirely in Devanagari,
 * CJK or Cyrillic, or one called `«»`, strips to the empty string. Without a fallback
 * the first such approval would mint the slug `''` (or, worse, `-2` once suffixed),
 * and the unique index would then reject the second one forever.
 */
const FALLBACK_BASE = 'org';

/**
 * `"Acme University of Technology"` -> `"acme-university-of-technology"`.
 *
 * NFKD then strip combining marks, so `Universität` becomes `universitat` rather
 * than losing the letter entirely — a diacritic should degrade to its base letter,
 * not vanish.
 */
export function slugifyOrgName(name: string): string {
  const base = name
    .normalize('NFKD')
    // Combining diacritical marks, left behind by NFKD.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    // Collapse runs and trim, in that order: `"  A & B  "` -> `-a-b-` -> `a-b`.
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH - SUFFIX_RESERVE)
    // Truncation can leave a trailing hyphen (`"acme-univer-"`); drop it so the
    // suffix does not read as `acme-univer--2`.
    .replace(/-+$/, '');

  return base || FALLBACK_BASE;
}

/**
 * The candidate sequence for one base: `acme`, `acme-2`, `acme-3`, …
 *
 * A generator rather than a list because the caller stops at the first insert that
 * succeeds, and the bound is a policy decision that belongs to the caller.
 */
export function* slugCandidates(base: string, maxAttempts: number): Generator<string> {
  yield base;
  for (let n = 2; n <= maxAttempts; n++) {
    yield `${base}-${n}`;
  }
}

/** Postgres unique-violation SQLSTATE. */
export const UNIQUE_VIOLATION = '23505';

/**
 * Whether an error is a unique violation on the organizations slug index
 * specifically.
 *
 * Narrow on purpose. A bare `code === '23505'` check would swallow a collision on
 * some OTHER unique index inside the same approval transaction — the pending-invite
 * index, say — and retry with a different slug, which would neither fix that problem
 * nor report it. Only a slug clash is worth another candidate.
 */
export function isSlugConflict(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { code?: unknown; constraint?: unknown; driverError?: unknown };
  const code = e.code ?? (e.driverError as { code?: unknown } | undefined)?.code;
  if (code !== UNIQUE_VIOLATION) return false;

  const constraint =
    e.constraint ?? (e.driverError as { constraint?: unknown } | undefined)?.constraint;
  // If the driver did not name the constraint, fall back to accepting the 23505 —
  // better to retry a slug once too often than to fail an approval outright.
  return constraint === undefined || constraint === 'uq_organizations_slug';
}
