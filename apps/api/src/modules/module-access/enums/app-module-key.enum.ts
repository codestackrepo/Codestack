/**
 * The single canonical set of app module keys (§9.7). Toggleable modules are
 * admin-controllable per role via the Module × Role matrix + backend guard;
 * SYSTEM modules are structural and always enabled (never in the matrix).
 */
export enum AppModuleKey {
  // toggleable (admin-controllable per role)
  CLASSROOMS = 'classrooms',
  PROBLEMS = 'problems',
  ASSIGNMENTS = 'assignments',
  PLAYGROUND = 'playground',
  GRADING = 'grading',
  TOPICS = 'topics',
  // SYSTEM — always-on, never in the matrix
  DASHBOARD = 'dashboard',
  PROFILE = 'profile',
  SETTINGS = 'settings',
}

/** The only keys the admin matrix + guard operate on. */
export const TOGGLEABLE_MODULES: AppModuleKey[] = [
  AppModuleKey.CLASSROOMS,
  AppModuleKey.PROBLEMS,
  AppModuleKey.ASSIGNMENTS,
  AppModuleKey.PLAYGROUND,
  AppModuleKey.GRADING,
  AppModuleKey.TOPICS,
];

/** Never gated — dashboard/profile/settings are structural and always enabled. */
export const SYSTEM_MODULES: AppModuleKey[] = [
  AppModuleKey.DASHBOARD,
  AppModuleKey.PROFILE,
  AppModuleKey.SETTINGS,
];
