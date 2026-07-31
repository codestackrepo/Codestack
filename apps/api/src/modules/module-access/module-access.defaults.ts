import { Role } from '../../common/enums/role.enum';
import { AppModuleKey, TOGGLEABLE_MODULES } from './enums/app-module-key.enum';

/**
 * Code-level defaults the DB override rows layer on top of. Effective access =
 * DB override if present, else this DEFAULT. SUPERADMIN bypasses the guard and
 * ADMIN is always true today (§9.7); their columns are true for completeness.
 */
export const MODULE_ACCESS_DEFAULTS: Record<AppModuleKey, Record<Role, boolean>> = {
  [AppModuleKey.CLASSROOMS]: { superadmin: true, admin: true, professor: true, student: true },
  [AppModuleKey.PROBLEMS]: { superadmin: true, admin: true, professor: true, student: true },
  [AppModuleKey.ASSIGNMENTS]: { superadmin: true, admin: true, professor: true, student: true },
  [AppModuleKey.PLAYGROUND]: { superadmin: true, admin: true, professor: true, student: true },
  // staff-only gradebook
  [AppModuleKey.GRADING]: { superadmin: true, admin: true, professor: true, student: false },
  [AppModuleKey.TOPICS]: { superadmin: true, admin: true, professor: true, student: true },
  /*
   * #69: reserved and OFF for professor and student until the league ships.
   *
   * `admin: true` is NOT an oversight. `resolveModule` short-circuits
   * `role === ADMIN` to true BEFORE it reads this map, so an `admin: false` here
   * would be a lie the table tells — and the defaults spec asserts that invariant
   * precisely to stop one being written. An org's admin therefore sees the league
   * module the moment it exists; hiding it from them needs a platform GRANT
   * (`granted: false`), which is the only layer admin immunity does not outrank.
   */
  [AppModuleKey.LEAGUE]: { superadmin: true, admin: true, professor: false, student: false },
  // SYSTEM modules default true for completeness; the guard never reads them.
  [AppModuleKey.DASHBOARD]: { superadmin: true, admin: true, professor: true, student: true },
  [AppModuleKey.PROFILE]: { superadmin: true, admin: true, professor: true, student: true },
  [AppModuleKey.SETTINGS]: { superadmin: true, admin: true, professor: true, student: true },
};

/** Whether a raw key is one of the admin-toggleable modules. */
export function isToggleable(key: string): key is AppModuleKey {
  return (TOGGLEABLE_MODULES as string[]).includes(key);
}
