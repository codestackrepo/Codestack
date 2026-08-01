import { isSlugConflict, slugCandidates, slugifyOrgName, SLUG_MAX_LENGTH } from './org-slug.util';

describe('slugifyOrgName', () => {
  it('lowercases and hyphenates a normal name', () => {
    expect(slugifyOrgName('Acme University of Technology')).toBe('acme-university-of-technology');
  });

  // A diacritic should degrade to its base letter rather than vanish, or `Universität`
  // would become `universit` and read as a truncation bug.
  it('folds diacritics to their base letters', () => {
    expect(slugifyOrgName('Universität Köln')).toBe('universitat-koln');
    expect(slugifyOrgName('École Polytechnique')).toBe('ecole-polytechnique');
  });

  it('collapses runs of separators and trims the ends', () => {
    expect(slugifyOrgName('  Acme  &&  Sons  ')).toBe('acme-sons');
    expect(slugifyOrgName('--Acme--')).toBe('acme');
  });

  it('drops punctuation entirely', () => {
    expect(slugifyOrgName("St. Mary's College (Main)")).toBe('st-mary-s-college-main');
  });

  /**
   * The degenerate case, and not hypothetical for this product: an organization named
   * entirely in a non-Latin script strips to nothing. Without the fallback the first
   * such approval would mint an empty slug and the unique index would then reject
   * every later one forever.
   */
  it.each([
    ['a CJK-only name', '東京大学'],
    ['a Devanagari-only name', 'विश्वविद्यालय'],
    ['punctuation only', '«»!!'],
    ['whitespace only', '   '],
  ])('falls back to a usable base for %s', (_label, name) => {
    expect(slugifyOrgName(name)).toBe('org');
  });

  // Truncation happens BEFORE any suffix is appended, so `-2` can never push the
  // value past the column width.
  it('leaves room for a collision suffix inside the column width', () => {
    const long = 'a'.repeat(200);
    const slug = slugifyOrgName(long);
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH - 4);
    expect(`${slug}-99`.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
  });

  // Otherwise a name truncated mid-word yields `acme-univer-` and the suffixed form
  // reads as `acme-univer--2`.
  it('never ends in a hyphen after truncation', () => {
    const name = `${'ab '.repeat(40)}tail`;
    expect(slugifyOrgName(name)).not.toMatch(/-$/);
  });
});

describe('slugCandidates', () => {
  it('offers the bare base first, then numbered variants from 2', () => {
    expect([...slugCandidates('acme', 4)]).toEqual(['acme', 'acme-2', 'acme-3', 'acme-4']);
  });

  it('yields only the base when a single attempt is allowed', () => {
    expect([...slugCandidates('acme', 1)]).toEqual(['acme']);
  });
});

/**
 * Narrow on purpose. A bare `code === '23505'` would swallow a collision on some other
 * unique index inside the same approval transaction — the pending-invite index, say —
 * and retry with a different slug, which neither fixes that nor reports it.
 */
describe('isSlugConflict', () => {
  it('recognises a slug unique violation', () => {
    expect(isSlugConflict({ code: '23505', constraint: 'uq_organizations_slug' })).toBe(true);
  });

  it('reads the code and constraint off a wrapped driver error', () => {
    expect(
      isSlugConflict({ driverError: { code: '23505', constraint: 'uq_organizations_slug' } }),
    ).toBe(true);
  });

  it('does NOT recognise a unique violation on a different index', () => {
    expect(isSlugConflict({ code: '23505', constraint: 'uq_org_invites_org_pending_email' })).toBe(
      false,
    );
  });

  it('does not recognise an unrelated database error', () => {
    expect(isSlugConflict({ code: '23514', constraint: 'chk_organizations_type' })).toBe(false);
    expect(isSlugConflict({ code: '23503' })).toBe(false);
  });

  // Better to retry a slug once too often than to fail an approval because a driver
  // did not populate `constraint`.
  it('accepts a 23505 whose constraint the driver did not name', () => {
    expect(isSlugConflict({ code: '23505' })).toBe(true);
  });

  it.each([[null], [undefined], ['boom'], [new Error('boom')]])(
    'is false for %p',
    (err: unknown) => {
      expect(isSlugConflict(err)).toBe(false);
    },
  );
});
