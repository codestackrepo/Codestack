// Plain `as const` objects + derived types instead of TS `enum` — this
// project's tsconfig has `erasableSyntaxOnly` on (real enums compile to a
// runtime object with reverse mappings, which isn't erasable), so this is
// the modern equivalent: same `Role.ADMIN` call-site ergonomics, zero
// non-erasable syntax.
export const Role = {
  SUPERADMIN: 'superadmin',
  ADMIN: 'admin',
  PROFESSOR: 'professor',
  STUDENT: 'student',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const STAFF_ROLES: Role[] = [Role.ADMIN, Role.PROFESSOR];

/** Role hierarchy — mirrors the backend ROLE_RANK. SUPERADMIN is the sole universal bypass. */
export const ROLE_RANK: Record<Role, number> = {
  [Role.SUPERADMIN]: 3,
  [Role.ADMIN]: 2,
  [Role.PROFESSOR]: 1,
  [Role.STUDENT]: 0,
};

/** True when `role` outranks or equals `min`. */
export const atLeast = (role: Role, min: Role): boolean => ROLE_RANK[role] >= ROLE_RANK[min];

export const Language = {
  PYTHON: 'python',
  JAVASCRIPT: 'javascript',
  JAVA: 'java',
  CPP: 'cpp',
} as const;
export type Language = (typeof Language)[keyof typeof Language];

/**
 * App module keys — mirrors the backend `AppModuleKey` enum. Toggleable modules
 * are admin-controllable per role (Module × Role matrix + backend guard); the
 * SYSTEM group (dashboard/profile/settings) is always-on and never gated.
 */
export const AppModuleKey = {
  CLASSROOMS: 'classrooms',
  PROBLEMS: 'problems',
  ASSIGNMENTS: 'assignments',
  PLAYGROUND: 'playground',
  GRADING: 'grading',
  TOPICS: 'topics',
  DASHBOARD: 'dashboard',
  PROFILE: 'profile',
  SETTINGS: 'settings',
} as const;
export type AppModuleKey = (typeof AppModuleKey)[keyof typeof AppModuleKey];

/** Effective per-role enabled map, as returned by `/auth/verify` + `/module-access/me`. */
export type ModuleMap = Record<AppModuleKey, boolean>;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}

/** Shape of every error response body — see AllExceptionsFilter on the backend. */
export interface ApiErrorBody {
  statusCode: number;
  /**
   * Copy safe to render. Not necessarily what the server sent: `parseApiError` resolves
   * it through `resolveErrorMessage` (#140) so a call site can never print an exception
   * class name. See `serverMessage` for the original.
   */
  message: string;
  error: string;
  errors?: string[];
  path: string;
  timestamp: string;
  /** The raw `message` as sent, before resolution — set by `parseApiError`. */
  serverMessage?: string;
  /** Machine-readable extra fields some errors carry (e.g. entitlement gating). */
  [key: string]: unknown;
}
