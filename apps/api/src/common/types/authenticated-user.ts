import { Role } from '../enums/role.enum';

/**
 * Shape attached to `request.user` after JWT validation.
 * Kept lean (claims only) — full user loads happen in services when needed.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}
