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
