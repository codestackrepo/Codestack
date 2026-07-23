import { Role } from '../../common/enums/role.enum';
import { AppModuleKey, SYSTEM_MODULES, TOGGLEABLE_MODULES } from './enums/app-module-key.enum';
import { MODULE_ACCESS_DEFAULTS, isToggleable } from './module-access.defaults';

describe('MODULE_ACCESS_DEFAULTS', () => {
  const keys = Object.values(AppModuleKey);
  const roles = Object.values(Role);

  it('has a boolean entry for every AppModuleKey × Role (no undefined)', () => {
    for (const key of keys) {
      for (const role of roles) {
        expect(typeof MODULE_ACCESS_DEFAULTS[key]?.[role]).toBe('boolean');
      }
    }
  });

  it('never locks admin out of any module', () => {
    for (const key of keys) {
      expect(MODULE_ACCESS_DEFAULTS[key][Role.ADMIN]).toBe(true);
    }
  });

  it('defaults grading OFF for students and every other toggleable ON', () => {
    expect(MODULE_ACCESS_DEFAULTS[AppModuleKey.GRADING][Role.STUDENT]).toBe(false);
    for (const key of TOGGLEABLE_MODULES) {
      if (key === AppModuleKey.GRADING) continue;
      expect(MODULE_ACCESS_DEFAULTS[key][Role.STUDENT]).toBe(true);
    }
  });
});

describe('isToggleable', () => {
  it('is true for toggleable keys and false for system/unknown', () => {
    expect(isToggleable('grading')).toBe(true);
    expect(isToggleable('problems')).toBe(true);
    expect(isToggleable('dashboard')).toBe(false);
    expect(isToggleable('nonsense')).toBe(false);
  });
});

describe('TOGGLEABLE_MODULES / SYSTEM_MODULES', () => {
  it('are disjoint and together cover every enum value', () => {
    const overlap = TOGGLEABLE_MODULES.filter((k) => SYSTEM_MODULES.includes(k));
    expect(overlap).toEqual([]);
    const union = new Set([...TOGGLEABLE_MODULES, ...SYSTEM_MODULES]);
    expect(union.size).toBe(Object.values(AppModuleKey).length);
    for (const key of Object.values(AppModuleKey)) {
      expect(union.has(key)).toBe(true);
    }
  });
});
