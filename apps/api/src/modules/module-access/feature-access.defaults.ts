import { Role } from '../../common/enums/role.enum';
import { FeatureKey } from './enums/feature-key.enum';

/**
 * Layer 4 of §5.5 — the NON-OVERRIDABLE role ceiling. A role absent from a
 * feature's list can never hold it: not by an org-admin override, not by a
 * platform override, not by an org role-default. This is what guarantees a
 * student never authors problems or publishes grades no matter what a console
 * writes, so it sits ABOVE every override layer rather than among the defaults.
 *
 * SUPERADMIN is deliberately absent from every list — it bypasses at layer 0 and
 * never reaches the ceiling. An empty list therefore means "SuperAdmin only".
 *
 * A feature with NO entry has no ceiling and is open to every role, subject to the
 * layers below (that is the case for the student-facing keys).
 */
export const FEATURE_ROLE_CEILING: Partial<Record<FeatureKey, Role[]>> = {
  [FeatureKey.PROBLEMS_AUTHOR]: [Role.ADMIN, Role.PROFESSOR],
  // Global (cross-org catalog) authoring is SuperAdmin-only by design (§5.6).
  [FeatureKey.PROBLEMS_GLOBAL]: [],
  [FeatureKey.ASSIGNMENTS_AUTHOR]: [Role.ADMIN, Role.PROFESSOR],
  [FeatureKey.ASSIGNMENTS_MCQ_CRUD]: [Role.ADMIN, Role.PROFESSOR],
  [FeatureKey.ASSIGNMENTS_QUIZ_CRUD]: [Role.ADMIN, Role.PROFESSOR],
  [FeatureKey.TOPICS_MODERATE]: [Role.ADMIN, Role.PROFESSOR],
  [FeatureKey.GRADING_PUBLISH]: [Role.ADMIN, Role.PROFESSOR],
  [FeatureKey.LEAGUE_HOST]: [Role.ADMIN, Role.PROFESSOR],
  // No ceiling — students are the intended audience:
  //   problems.feedback, topics.comment
};

/**
 * Layer 8 — the code DEFAULT for a feature × role, consulted only after every
 * override layer misses. SPARSE: an absent key or role resolves to `true` (§5.5),
 * so this lists only the cells whose default is deliberately OFF.
 *
 * Note these never loosen the ceiling above: a `true` here for a role the ceiling
 * excludes is still a hard false.
 */
export const FEATURE_DEFAULTS: Partial<Record<FeatureKey, Partial<Record<Role, boolean>>>> = {
  // Reserved until #69 builds the league; off even for the roles the ceiling allows.
  [FeatureKey.LEAGUE_HOST]: { [Role.ADMIN]: false, [Role.PROFESSOR]: false },
};

/**
 * The ceiling test on its own — exported so the console can render a cell as
 * permanently locked rather than merely off, and so the resolver has one place to
 * ask. Returns true when `role` is allowed to hold `feature` at all.
 */
export function withinRoleCeiling(feature: FeatureKey, role: Role): boolean {
  const ceiling = FEATURE_ROLE_CEILING[feature];
  if (!ceiling) return true; // no ceiling declared -> open to every role
  return ceiling.includes(role);
}
