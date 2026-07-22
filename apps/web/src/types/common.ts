// Plain `as const` objects + derived types instead of TS `enum` — this
// project's tsconfig has `erasableSyntaxOnly` on (real enums compile to a
// runtime object with reverse mappings, which isn't erasable), so this is
// the modern equivalent: same `Role.ADMIN` call-site ergonomics, zero
// non-erasable syntax.
export const Role = {
  ADMIN: 'admin',
  PROFESSOR: 'professor',
  STUDENT: 'student',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const STAFF_ROLES: Role[] = [Role.ADMIN, Role.PROFESSOR];

export const Language = {
  PYTHON: 'python',
  JAVASCRIPT: 'javascript',
  JAVA: 'java',
  CPP: 'cpp',
} as const;
export type Language = (typeof Language)[keyof typeof Language];

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
  message: string;
  error: string;
  errors?: string[];
  path: string;
  timestamp: string;
  /** Machine-readable extra fields some errors carry (e.g. entitlement gating). */
  [key: string]: unknown;
}
