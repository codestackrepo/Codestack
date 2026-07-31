import { Role } from '../../common/enums/role.enum';
import { AppModuleKey } from './enums/app-module-key.enum';
import { ALL_FEATURES, FeatureKey, featureModule, isFeatureKey } from './enums/feature-key.enum';
import { FEATURE_ROLE_CEILING, withinRoleCeiling } from './feature-access.defaults';

describe('FeatureKey namespace', () => {
  it('every key is dotted, and the prefix is a real module except the reserved one', () => {
    for (const key of ALL_FEATURES) {
      expect(key).toContain('.');
      const owning = featureModule(key);
      if (key === FeatureKey.LEAGUE_HOST) {
        // Reserved until #69 registers the module — resolves to nothing on purpose.
        expect(owning).toBeUndefined();
      } else {
        expect(Object.values(AppModuleKey)).toContain(owning);
      }
    }
  });

  it('isFeatureKey separates dotted features from bare module keys', () => {
    expect(isFeatureKey(FeatureKey.PROBLEMS_AUTHOR)).toBe(true);
    expect(isFeatureKey(AppModuleKey.PROBLEMS)).toBe(false);
    expect(isFeatureKey('problems.nonexistent')).toBe(false);
  });
});

describe('FEATURE_ROLE_CEILING', () => {
  it('never lists SUPERADMIN — it bypasses at layer 0 and never reaches the ceiling', () => {
    for (const roles of Object.values(FEATURE_ROLE_CEILING)) {
      expect(roles).not.toContain(Role.SUPERADMIN);
    }
  });

  it('keeps students out of every authoring/publishing feature', () => {
    const staffOnly = [
      FeatureKey.PROBLEMS_AUTHOR,
      FeatureKey.PROBLEMS_GLOBAL,
      FeatureKey.ASSIGNMENTS_AUTHOR,
      FeatureKey.ASSIGNMENTS_MCQ_CRUD,
      FeatureKey.ASSIGNMENTS_QUIZ_CRUD,
      FeatureKey.TOPICS_MODERATE,
      FeatureKey.GRADING_PUBLISH,
      FeatureKey.LEAGUE_HOST,
    ];
    for (const key of staffOnly) expect(withinRoleCeiling(key, Role.STUDENT)).toBe(false);
  });

  it('an EMPTY ceiling means SuperAdmin-only, not "everyone"', () => {
    expect(FEATURE_ROLE_CEILING[FeatureKey.PROBLEMS_GLOBAL]).toEqual([]);
    expect(withinRoleCeiling(FeatureKey.PROBLEMS_GLOBAL, Role.ADMIN)).toBe(false);
    expect(withinRoleCeiling(FeatureKey.PROBLEMS_GLOBAL, Role.PROFESSOR)).toBe(false);
    expect(withinRoleCeiling(FeatureKey.PROBLEMS_GLOBAL, Role.STUDENT)).toBe(false);
  });

  it('an ABSENT ceiling means open to every role (student-facing keys)', () => {
    expect(FEATURE_ROLE_CEILING[FeatureKey.TOPICS_COMMENT]).toBeUndefined();
    expect(withinRoleCeiling(FeatureKey.TOPICS_COMMENT, Role.STUDENT)).toBe(true);
    expect(withinRoleCeiling(FeatureKey.PROBLEMS_FEEDBACK, Role.STUDENT)).toBe(true);
  });
});
