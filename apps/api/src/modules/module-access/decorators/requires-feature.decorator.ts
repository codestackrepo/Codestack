import { SetMetadata } from '@nestjs/common';
import { FeatureKey } from '../enums/feature-key.enum';

export const FEATURE_KEY = 'requiresFeature';

/**
 * Gates a controller/route behind a dotted feature key (#64). Finer than
 * `@RequiresModule`: the module decides whether the area exists for a role, the
 * feature decides whether this specific capability does (authoring, publishing).
 *
 * Deliberately ONE key per route. An `any-of` / `all-of` list reads the same at
 * the call site but means opposite things, and getting it backwards silently
 * widens access — split the route or add a key instead.
 *
 * Enforced by FeatureGuard, which is wired as an APP_GUARD in the same change:
 * an annotation with no live guard is decoration, and reviewers would reasonably
 * assume it gates something (§9.11).
 */
export const RequiresFeature = (feature: FeatureKey) => SetMetadata(FEATURE_KEY, feature);
