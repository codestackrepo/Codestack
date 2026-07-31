import type { AppModuleKey, Role } from './common';
import type { QuotaUsage } from './organization';

/**
 * Mirrors `apps/api/src/modules/module-access/enums/feature-key.enum.ts`.
 *
 * `as const` object, not a TS `enum`: `apps/web/tsconfig.json` sets
 * `erasableSyntaxOnly`, under which `enum` fails the build.
 */
export const FeatureKey = {
  PROBLEMS_AUTHOR: 'problems.author',
  PROBLEMS_GLOBAL: 'problems.global',
  PROBLEMS_FEEDBACK: 'problems.feedback',
  ASSIGNMENTS_AUTHOR: 'assignments.author',
  ASSIGNMENTS_MCQ_CRUD: 'assignments.mcq-crud',
  ASSIGNMENTS_QUIZ_CRUD: 'assignments.quiz-crud',
  TOPICS_COMMENT: 'topics.comment',
  TOPICS_MODERATE: 'topics.moderate',
  GRADING_PUBLISH: 'grading.publish',
  LEAGUE_HOST: 'league.host',
} as const;
export type FeatureKey = (typeof FeatureKey)[keyof typeof FeatureKey];

/** A module key or a dotted feature key — the matrix carries both. */
export type AccessKey = AppModuleKey | FeatureKey;

/**
 * Mirrors `MatrixCell` in `apps/api/src/modules/module-access/module-access.service.ts`.
 *
 * `moduleKey` is a misnomer inherited from the API: it holds module keys AND dotted
 * feature keys. Split them with the `toggleable` / `features` lists on the envelope
 * rather than by looking for a dot — the server owns which keys exist.
 */
export interface MatrixCell {
  moduleKey: AccessKey;
  role: Role;
  enabled: boolean;
  /**
   * A role ceiling or org-admin immunity owns this cell, so no override at this
   * layer can move it. Render disabled with the reason — never as a toggle the
   * resolver will silently ignore.
   */
  locked: boolean;
}

/** Mirrors `OrgMatrixResponseDto` (`platform-entitlements.dto.ts`). */
export interface OrgMatrix {
  toggleable: AppModuleKey[];
  system: AppModuleKey[];
  features: FeatureKey[];
  matrix: MatrixCell[];
}

/** Mirrors `QuotaResource` (`apps/api/src/modules/quotas/enums/quota-resource.enum.ts`). */
export const QuotaResource = {
  MAX_USERS: 'max_users',
  MAX_PROBLEMS: 'max_problems',
  MAX_ASSIGNMENTS: 'max_assignments',
} as const;
export type QuotaResource = (typeof QuotaResource)[keyof typeof QuotaResource];

/** Mirrors `OrgQuotaResponseDto`. Keyed by the snake_case resource values. */
export interface OrgQuotas {
  usage: Record<QuotaResource, QuotaUsage>;
}

/** Human labels, kept next to the keys so a new resource is one edit. */
export const QUOTA_LABELS: Record<QuotaResource, string> = {
  max_users: 'Members (seats)',
  max_problems: 'Problems',
  max_assignments: 'Assignments',
};
