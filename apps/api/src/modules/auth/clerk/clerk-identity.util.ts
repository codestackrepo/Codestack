import { UnauthorizedException } from '@nestjs/common';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { User } from '../../users/entities/user.entity';
import { UsersService } from '../../users/users.service';
import { ClerkService, ClerkSessionClaims } from './clerk.service';

interface Deps {
  users: UsersService;
  clerk: ClerkService;
}

/**
 * Project a LOCAL user row to the request.user claim shape. `id` is ALWAYS the
 * local DB uuid (never the Clerk sub) — AppThrottlerGuard, scopeToOrg /
 * assertSameOrg and services all key on it. role + organizationId are
 * DB-authoritative, never read from the token.
 */
export function toAuthenticatedUser(user: User): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
  };
}

/**
 * Resolve the LOCAL user for a verified Clerk token, JIT-provisioning on first
 * sight. findByClerkId hit -> return as-is (DB is authoritative for role/org;
 * the #52 webhook keeps them synced). Miss -> fetch email+name from the Backend
 * API (the default token omits them) and upsert.
 *
 * A first-sight JIT user is deliberately provisioned as STUDENT in the Legacy
 * org (upsertFromClerk defaults) — never with the Clerk org id (which is not a
 * local org uuid) and never null-org (would violate chk_users_org_required).
 * The #52 webhook reconciles the real role + org from Clerk membership.
 */
export async function resolveLocalUserFromClerk(
  claims: ClerkSessionClaims,
  deps: Deps,
): Promise<User> {
  const clerkUserId = claims.sub;

  const existing = await deps.users.findByClerkId(clerkUserId);
  if (existing) return existing; // do NOT overwrite role/org from claims

  const profile = await deps.clerk.getUserProfile(clerkUserId);
  if (!profile.email) {
    throw new UnauthorizedException('Clerk account has no primary email');
  }
  return deps.users.upsertFromClerk({
    clerkUserId,
    email: profile.email,
    firstName: profile.firstName ?? '',
    lastName: profile.lastName ?? '',
  });
}
