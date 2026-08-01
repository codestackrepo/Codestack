/**
 * Per-organization branding (#118) — the "CodeStack × your institution" lockup.
 *
 * Stored inside `organizations.settings` JSONB under a `branding` key rather than as
 * new columns, which is what that column's own comment reserves it for. Two reasons it
 * belongs there: branding is read as a whole or not at all (never filtered or joined
 * on), and it will grow fields — an accent colour, a short name — that would each be a
 * migration otherwise.
 *
 * VALIDATED AT WRITE, NEVER AT RENDER. That direction is deliberate and load-bearing:
 * a template must not throw. Mail rendering happens on the worker, inside a BullMQ job
 * that would retry five times over eight minutes and then park a failed job — all
 * because someone typed a bad URL into a settings form months earlier. So a bad value
 * is refused at the boundary where a human is present to fix it, and the renderer
 * treats whatever it finds as optional decoration.
 */

export interface OrgBranding {
  /**
   * Absolute https URL of the organization's logo.
   *
   * https-only, and not merely for tidiness: an http image inside an https console
   * triggers mixed-content blocking (the logo silently vanishes), and in a MAIL body it
   * invites a network attacker to swap the image a member sees. `data:` and `javascript:`
   * are refused for the obvious reason — this string is interpolated into an `src`.
   */
  logoUrl?: string;
  /**
   * Shown instead of the full legal name where space is tight, e.g. "Acme" for
   * "Acme University of Science and Technology". Optional; the org name is the fallback.
   */
  displayName?: string;
}

/** Length caps. Generous, but bounded — this ends up in an attribute and a header. */
const MAX_LOGO_URL = 500;
const MAX_DISPLAY_NAME = 60;

export class InvalidBrandingError extends Error {}

/**
 * Validates and normalises a branding payload, or throws.
 *
 * Returns `undefined` for an empty result rather than `{}` so a caller clearing
 * branding removes the key entirely, and `hasBranding` stays a simple existence check.
 */
export function parseOrgBranding(input: unknown): OrgBranding | undefined {
  if (input === null || input === undefined) return undefined;
  if (typeof input !== 'object') throw new InvalidBrandingError('branding must be an object');

  const { logoUrl, displayName } = input as Record<string, unknown>;
  const out: OrgBranding = {};

  if (logoUrl !== undefined && logoUrl !== null && logoUrl !== '') {
    if (typeof logoUrl !== 'string' || logoUrl.length > MAX_LOGO_URL) {
      throw new InvalidBrandingError(`logoUrl must be a string of at most ${MAX_LOGO_URL} chars`);
    }
    let parsed: URL;
    try {
      parsed = new URL(logoUrl);
    } catch {
      throw new InvalidBrandingError('logoUrl must be an absolute URL');
    }
    if (parsed.protocol !== 'https:') {
      throw new InvalidBrandingError('logoUrl must use https');
    }
    out.logoUrl = parsed.toString();
  }

  if (displayName !== undefined && displayName !== null && displayName !== '') {
    if (typeof displayName !== 'string') {
      throw new InvalidBrandingError('displayName must be a string');
    }
    const trimmed = displayName.trim();
    if (trimmed.length > MAX_DISPLAY_NAME) {
      throw new InvalidBrandingError(`displayName must be at most ${MAX_DISPLAY_NAME} chars`);
    }
    if (trimmed) out.displayName = trimmed;
  }

  return Object.keys(out).length ? out : undefined;
}

/**
 * Reads branding out of an org's settings blob. NEVER throws.
 *
 * The read path is the render path, so it is total: a settings blob that somehow holds
 * a malformed value produces "no branding" rather than an exception on the mail worker.
 * `parseOrgBranding` is what stops that value being written in the first place; this is
 * the belt to its braces.
 */
export function readOrgBranding(settings: unknown): OrgBranding | undefined {
  if (typeof settings !== 'object' || settings === null) return undefined;
  const raw = (settings as Record<string, unknown>).branding;
  try {
    return parseOrgBranding(raw);
  } catch {
    return undefined;
  }
}
