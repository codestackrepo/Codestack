import { Role } from '../../common/enums/role.enum';
import { AppModuleKey, TOGGLEABLE_MODULES } from './enums/app-module-key.enum';

/**
 * Code-level defaults the DB override rows layer on top of. Effective access =
 * DB override if present, else this DEFAULT. Admin is always true (admin bypasses
 * the guard and its matrix cells are locked-on, §9.7).
 */
export const MODULE_ACCESS_DEFAULTS: Record<AppModuleKey, Record<Role, boolean>> = {
  [AppModuleKey.CLASSROOMS]: { admin: true, professor: true, student: true },
  [AppModuleKey.PROBLEMS]: { admin: true, professor: true, student: true },
  [AppModuleKey.ASSIGNMENTS]: { admin: true, professor: true, student: true },
  [AppModuleKey.PLAYGROUND]: { admin: true, professor: true, student: true },
  [AppModuleKey.GRADING]: { admin: true, professor: true, student: false }, // staff-only gradebook
  [AppModuleKey.TOPICS]: { admin: true, professor: true, student: true },
  // SYSTEM modules default true for completeness; the guard never reads them.
  [AppModuleKey.DASHBOARD]: { admin: true, professor: true, student: true },
  [AppModuleKey.PROFILE]: { admin: true, professor: true, student: true },
  [AppModuleKey.SETTINGS]: { admin: true, professor: true, student: true },
};

/** Whether a raw key is one of the admin-toggleable modules. */
export function isToggleable(key: string): key is AppModuleKey {
  return (TOGGLEABLE_MODULES as string[]).includes(key);
}
