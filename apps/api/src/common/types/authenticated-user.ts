import { Role } from '../enums/role.enum';

/**
 * Shape attached to `request.user` after auth. Kept lean (claims only) — full
 * user loads happen in services when needed.
 *
 * `organizationId` is the tenant carrier consumed by scopeToOrg / assertSameOrg
 * and (once wired, #51) the TenantContextGuard. NULL only for SUPERADMIN. It is
 * populated from the JWT today and by the Clerk guard after the auth cutover.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  organizationId: string | null;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  // Optional so tokens issued before multi-tenancy still validate (they resolve
  // to a null org until the session is refreshed). Deleted with JWT auth in #51.
  organizationId?: string | null;
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}
