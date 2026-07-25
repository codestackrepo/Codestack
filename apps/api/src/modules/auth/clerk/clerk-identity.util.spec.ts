import { UnauthorizedException } from '@nestjs/common';
import { Role } from '../../../common/enums/role.enum';
import { User } from '../../users/entities/user.entity';
import { UsersService } from '../../users/users.service';
import { ClerkService, ClerkSessionClaims } from './clerk.service';
import { resolveLocalUserFromClerk, toAuthenticatedUser } from './clerk-identity.util';

describe('toAuthenticatedUser', () => {
  it('projects the LOCAL uuid and DB-authoritative role/org (never the Clerk sub)', () => {
    const user = {
      id: 'local-uuid',
      email: 'a@x.dev',
      role: Role.ADMIN,
      organizationId: 'org-1',
      clerkUserId: 'user_clerk_sub',
    } as User;
    expect(toAuthenticatedUser(user)).toEqual({
      id: 'local-uuid',
      email: 'a@x.dev',
      role: Role.ADMIN,
      organizationId: 'org-1',
    });
  });
});

describe('resolveLocalUserFromClerk', () => {
  const claims = { sub: 'user_abc' } as unknown as ClerkSessionClaims;
  let users: { findByClerkId: jest.Mock; upsertFromClerk: jest.Mock };
  let clerk: { getUserProfile: jest.Mock };

  const deps = () => ({
    users: users as unknown as UsersService,
    clerk: clerk as unknown as ClerkService,
  });

  beforeEach(() => {
    users = { findByClerkId: jest.fn(), upsertFromClerk: jest.fn() };
    clerk = { getUserProfile: jest.fn() };
  });

  it('returns the linked user as-is — no profile fetch, no upsert (DB authoritative)', async () => {
    const existing = { id: 'u1', role: Role.PROFESSOR } as User;
    users.findByClerkId.mockResolvedValue(existing);
    await expect(resolveLocalUserFromClerk(claims, deps())).resolves.toBe(existing);
    expect(clerk.getUserProfile).not.toHaveBeenCalled();
    expect(users.upsertFromClerk).not.toHaveBeenCalled();
  });

  it('JIT-provisions on first sight via getUserProfile + upsertFromClerk', async () => {
    users.findByClerkId.mockResolvedValue(null);
    clerk.getUserProfile.mockResolvedValue({ email: 'New@X.dev', firstName: 'N', lastName: 'U' });
    const created = { id: 'u2' } as User;
    users.upsertFromClerk.mockResolvedValue(created);
    await expect(resolveLocalUserFromClerk(claims, deps())).resolves.toBe(created);
    expect(users.upsertFromClerk).toHaveBeenCalledWith({
      clerkUserId: 'user_abc',
      email: 'New@X.dev',
      firstName: 'N',
      lastName: 'U',
    });
  });

  it('401s when the Clerk account has no primary email (never provisions a null-email row)', async () => {
    users.findByClerkId.mockResolvedValue(null);
    clerk.getUserProfile.mockResolvedValue({ email: null, firstName: null, lastName: null });
    await expect(resolveLocalUserFromClerk(claims, deps())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(users.upsertFromClerk).not.toHaveBeenCalled();
  });

  it('coerces null names to empty strings for the upsert', async () => {
    users.findByClerkId.mockResolvedValue(null);
    clerk.getUserProfile.mockResolvedValue({ email: 'x@x.dev', firstName: null, lastName: null });
    users.upsertFromClerk.mockResolvedValue({ id: 'u3' } as User);
    await resolveLocalUserFromClerk(claims, deps());
    expect(users.upsertFromClerk).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: '', lastName: '' }),
    );
  });
});
