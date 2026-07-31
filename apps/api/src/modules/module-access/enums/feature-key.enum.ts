import { AppModuleKey } from './app-module-key.enum';

/**
 * Dotted feature keys (#64, §5.5) — a finer gate INSIDE a module. `problems` is a
 * module (does this area exist for the role at all); `problems.author` is a
 * feature (may the role create one). The dot is load-bearing: the part before it
 * names the owning module, and a feature is reachable only if that module is.
 *
 * Stored as varchar(80) in `module_access.module_key` / `org_module_grant
 * .feature_key`, so adding a key is code-only — no migration, no ALTER TYPE.
 */
export enum FeatureKey {
  PROBLEMS_AUTHOR = 'problems.author',
  PROBLEMS_GLOBAL = 'problems.global',
  PROBLEMS_FEEDBACK = 'problems.feedback',
  ASSIGNMENTS_AUTHOR = 'assignments.author',
  ASSIGNMENTS_MCQ_CRUD = 'assignments.mcq-crud',
  ASSIGNMENTS_QUIZ_CRUD = 'assignments.quiz-crud',
  TOPICS_COMMENT = 'topics.comment',
  /**
   * Locking / editing a topic, resolving a question, deleting someone else's
   * comment (#76). Separate from `topics.comment` on purpose: an org may want
   * students discussing without granting professors moderation, or the reverse.
   */
  TOPICS_MODERATE = 'topics.moderate',
  GRADING_PUBLISH = 'grading.publish',
  /**
   * RESERVED, and denied to every non-SuperAdmin until #69 registers a `league`
   * module: its prefix is deliberately not an AppModuleKey yet, and
   * `featureModule` returns undefined for an unknown prefix, which the resolver
   * treats as a hard false. Reserving the key fail-safe (rather than fail-open) is
   * the point — an un-built feature must not be reachable because a lookup missed.
   */
  LEAGUE_HOST = 'league.host',
}

export const ALL_FEATURES: FeatureKey[] = Object.values(FeatureKey);

/** Any gateable key: a module (`problems`) or a dotted feature (`problems.author`). */
export type AccessKey = AppModuleKey | FeatureKey;

const KNOWN_MODULES: string[] = Object.values(AppModuleKey);

/**
 * The module a feature lives in, or `undefined` when the prefix names no known
 * module. The resolver checks the module first and short-circuits: without that,
 * disabling the `problems` module would leave `problems.author` reachable, and an
 * unregistered prefix would fall through every layer to the `?? true` default.
 */
export function featureModule(feature: FeatureKey): AppModuleKey | undefined {
  const prefix = feature.split('.')[0];
  return KNOWN_MODULES.includes(prefix) ? (prefix as AppModuleKey) : undefined;
}

/** True for a dotted feature key, false for a bare module key. */
export function isFeatureKey(key: string): key is FeatureKey {
  return (ALL_FEATURES as string[]).includes(key);
}
