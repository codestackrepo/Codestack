import { InvalidBrandingError, parseOrgBranding, readOrgBranding } from './org-branding';

describe('parseOrgBranding', () => {
  it('accepts a plain https logo URL and a display name', () => {
    expect(parseOrgBranding({ logoUrl: 'https://acme.edu/logo.png', displayName: 'Acme' })).toEqual(
      { logoUrl: 'https://acme.edu/logo.png', displayName: 'Acme' },
    );
  });

  /**
   * https ONLY, and not for tidiness. An http image inside an https console is blocked
   * as mixed content — the logo silently vanishes — and inside a MAIL body it lets a
   * network attacker swap the image a member sees.
   */
  it('rejects http', () => {
    expect(() => parseOrgBranding({ logoUrl: 'http://acme.edu/logo.png' })).toThrow(
      InvalidBrandingError,
    );
  });

  // This string is interpolated into an `src` attribute in both the app and the mail.
  it.each([
    ['javascript', 'javascript:alert(1)'],
    ['data', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='],
    ['file', 'file:///etc/passwd'],
  ])('rejects a %s: URL', (_label, logoUrl) => {
    expect(() => parseOrgBranding({ logoUrl })).toThrow(InvalidBrandingError);
  });

  it('rejects a relative URL', () => {
    expect(() => parseOrgBranding({ logoUrl: '/logo.png' })).toThrow(InvalidBrandingError);
  });

  it('rejects an over-long URL', () => {
    expect(() => parseOrgBranding({ logoUrl: `https://acme.edu/${'a'.repeat(600)}` })).toThrow(
      InvalidBrandingError,
    );
  });

  it('rejects an over-long display name', () => {
    expect(() => parseOrgBranding({ displayName: 'a'.repeat(100) })).toThrow(InvalidBrandingError);
  });

  it('trims a display name', () => {
    expect(parseOrgBranding({ displayName: '  Acme  ' })).toEqual({ displayName: 'Acme' });
  });

  /**
   * Empty in, undefined out — never `{}`. Clearing branding must DELETE the key, so
   * `readOrgBranding` stays a plain existence check rather than "an object with no
   * useful fields", which every consumer would then have to re-test.
   */
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty object', {}],
    ['empty strings', { logoUrl: '', displayName: '' }],
  ])('returns undefined for %s', (_label, input) => {
    expect(parseOrgBranding(input)).toBeUndefined();
  });

  it('keeps whichever half was supplied', () => {
    expect(parseOrgBranding({ logoUrl: 'https://acme.edu/l.png' })).toEqual({
      logoUrl: 'https://acme.edu/l.png',
    });
    expect(parseOrgBranding({ displayName: 'Acme' })).toEqual({ displayName: 'Acme' });
  });

  it('rejects a non-object', () => {
    expect(() => parseOrgBranding('https://acme.edu/l.png')).toThrow(InvalidBrandingError);
  });
});

/**
 * The READ path is the RENDER path, so it is total.
 *
 * A mail template must never throw: rendering happens on the BullMQ worker, and an
 * exception there burns five retries over eight minutes and parks a failed job. So a
 * settings blob that somehow holds a malformed value yields "no branding" rather than
 * an error. `parseOrgBranding` is what stops such a value being written; this is the
 * belt to its braces.
 */
describe('readOrgBranding', () => {
  it('reads branding out of a settings blob', () => {
    expect(readOrgBranding({ branding: { displayName: 'Acme' }, timezone: 'UTC' })).toEqual({
      displayName: 'Acme',
    });
  });

  it.each([
    ['no branding key', { timezone: 'UTC' }],
    ['an empty settings object', {}],
    ['null settings', null],
    ['a non-object', 'nope'],
  ])('returns undefined for %s', (_label, settings) => {
    expect(readOrgBranding(settings)).toBeUndefined();
  });

  it('NEVER throws on a malformed stored value — it degrades to no branding', () => {
    expect(readOrgBranding({ branding: { logoUrl: 'javascript:alert(1)' } })).toBeUndefined();
    expect(readOrgBranding({ branding: 'not-an-object' })).toBeUndefined();
    expect(readOrgBranding({ branding: { logoUrl: 'http://acme.edu/l.png' } })).toBeUndefined();
  });

  /**
   * All-or-nothing on a partly-bad stored value: one invalid field discards the whole
   * branding, including a display name that was perfectly fine.
   *
   * That is a real trade-off rather than an accident. Salvaging the good half would mean
   * `readOrgBranding` implementing its own lenient parse, diverging from the strict one
   * that guards writes — two rules for one field, and the lenient one running on the
   * mail worker where nobody is watching. A tenant whose logo URL is somehow invalid
   * shows plain CodeStack until someone fixes it, which is visible and self-correcting.
   * Reaching this state at all requires bypassing `parseOrgBranding` on the write path.
   */
  it('discards the whole value when any part of it is invalid', () => {
    expect(
      readOrgBranding({ branding: { logoUrl: 'http://bad', displayName: 'Acme' } }),
    ).toBeUndefined();
  });
});
