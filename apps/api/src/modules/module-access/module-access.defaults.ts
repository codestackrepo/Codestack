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
  // SYSTEM modules default true for completeness; the guard never reads them.
  [AppModuleKey.DASHBOARD]: { superadmin: true, admin: true, professor: true, student: true },
  [AppModuleKey.PROFILE]: { superadmin: true, admin: true, professor: true, student: true },
  [AppModuleKey.SETTINGS]: { superadmin: true, admin: true, professor: true, student: true },
};

/** Whether a raw key is one of the admin-toggleable modules. */
export function isToggleable(key: string): key is AppModuleKey {
  return (TOGGLEABLE_MODULES as string[]).includes(key);
}
