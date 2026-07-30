import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { User } from '../users/entities/user.entity';

/**
 * Project a LOCAL user row into the `request.user` claim shape.
 *
 * `role` and `organizationId` are DB-authoritative — never read from the token.
 * That is what lets a revoke, an org assignment or a role change take effect on
 * the target's NEXT request instead of at token expiry: `JwtAuthGuard` re-stamps
 * `request.user` through this projection on every authenticated request.
 */
export function toAuthenticatedUser(user: User): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
  };
}
