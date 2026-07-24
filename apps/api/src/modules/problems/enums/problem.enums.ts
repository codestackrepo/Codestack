export enum Difficulty {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard',
}

export enum TestCaseType {
  SAMPLE = 'sample',
  HIDDEN = 'hidden',
}

/** Provenance of a problem — human-authored vs AI-generated (Phase 2). */
export enum ProblemSource {
  HUMAN = 'human',
  AI = 'ai',
}

/** Visibility — AI drafts stay private until curated/shared. */
export enum ProblemVisibility {
  PRIVATE = 'private',
  SHARED = 'shared',
}

/**
 * Platform reach (#56) — a platform-wide catalog problem vs an org-owned one.
 * Orthogonal to `visibility` (the intra-org private|shared axis): a GLOBAL
 * problem is a superadmin draft while private, published to every org when
 * shared. DB CHECK: scope='global' <=> organization_id IS NULL.
 */
export enum ProblemScope {
  GLOBAL = 'global',
  ORG = 'org',
}
