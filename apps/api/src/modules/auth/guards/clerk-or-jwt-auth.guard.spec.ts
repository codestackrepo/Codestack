import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../../common/enums/role.enum';
import { UsersService } from '../../users/users.service';
import { ClerkService } from '../clerk/clerk.service';
import { ClerkOrJwtAuthGuard } from './clerk-or-jwt-auth.guard';

// super.canActivate() belongs to the AuthGuard('jwt') mixin one link up the chain.
const superProto = Object.getPrototypeOf(ClerkOrJwtAuthGuard.prototype);

function context(request: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('ClerkOrJwtAuthGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let clerk: { isConfigured: jest.Mock; verifyToken: jest.Mock; getUserProfile: jest.Mock };
  let users: { findByClerkId: jest.Mock; findById: jest.Mock; upsertFromClerk: jest.Mock };
  let guard: ClerkOrJwtAuthGuard;
  let superSpy: jest.SpyInstance;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    clerk = {
      isConfigured: jest.fn().mockReturnValue(true),
      verifyToken: jest.fn(),
      getUserProfile: jest.fn(),
    };
    users = { findByClerkId: jest.fn(), findById: jest.fn(), upsertFromClerk: jest.fn() };
    guard = new ClerkOrJwtAuthGuard(
      reflector as unknown as Reflector,
      clerk as unknown as ClerkService,
      users as unknown as UsersService,
    );
    superSpy = jest.spyOn(superProto, 'canActivate');
  });

  afterEach(() => jest.restoreAllMocks());

  it('short-circuits @Public routes without touching Clerk or the cookie strategy', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const req = { headers: { authorization: 'Bearer stray' } };
    await expect(guard.canActivate(context(req))).resolves.toBe(true);
    expect(clerk.verifyToken).not.toHaveBeenCalled();
    expect(superSpy).not.toHaveBeenCalled();
  });

  describe('Clerk bearer path', () => {
    it('verifies, resolves the local user, and sets request.user to the LOCAL identity', async () => {
      clerk.verifyToken.mockResolvedValue({ sub: 'user_abc' });
      users.findByClerkId.mockResolvedValue({
        id: 'local-1',
        email: 'a@x.dev',
        role: Role.STUDENT,
        organizationId: 'org-1',
        isActive: true,
      });
      const req: Record<string, unknown> = { headers: { authorization: 'Bearer tok123' } };
      await expect(guard.canActivate(context(req))).resolves.toBe(true);
      expect(clerk.verifyToken).toHaveBeenCalledWith('tok123');
      expect(req.user).toEqual({
        id: 'local-1',
        email: 'a@x.dev',
        role: Role.STUDENT,
        organizationId: 'org-1',
      });
      expect(superSpy).not.toHaveBeenCalled();
    });

    it('rejects a disabled local account (isActive kill-switch) even with a valid token', async () => {
      clerk.verifyToken.mockResolvedValue({ sub: 'user_abc' });
      users.findByClerkId.mockResolvedValue({ id: 'l', isActive: false });
      const req = { headers: { authorization: 'Bearer tok' } };
      await expect(guard.canActivate(context(req))).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('falls back to the cookie strategy when a Bearer is present but Clerk is unconfigured', async () => {
      clerk.isConfigured.mockReturnValue(false);
      superSpy.mockResolvedValue(true);
      users.findById.mockResolvedValue({ id: 'l2', isActive: true });
      const req: Record<string, unknown> = {
        headers: { authorization: 'Bearer x' },
        user: { id: 'l2' },
      };
      await expect(guard.canActivate(context(req))).resolves.toBe(true);
      expect(clerk.verifyToken).not.toHaveBeenCalled();
      expect(superSpy).toHaveBeenCalled();
    });
  });

  describe('JWT cookie fallback', () => {
    it('runs passport then enforces the isActive kill-switch via a fresh DB read', async () => {
      superSpy.mockResolvedValue(true);
      users.findById.mockResolvedValue({ id: 'l3', isActive: true });
      const req = { headers: {}, user: { id: 'l3' } };
      await expect(guard.canActivate(context(req))).resolves.toBe(true);
      expect(users.findById).toHaveBeenCalledWith('l3');
    });

    it('rejects when the DB says the account is disabled', async () => {
      superSpy.mockResolvedValue(true);
      users.findById.mockResolvedValue({ id: 'l3', isActive: false });
      const req = { headers: {}, user: { id: 'l3' } };
      await expect(guard.canActivate(context(req))).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('returns false without a DB read when passport rejects the cookie', async () => {
      superSpy.mockResolvedValue(false);
      const req = { headers: {}, user: undefined };
      await expect(guard.canActivate(context(req))).resolves.toBe(false);
      expect(users.findById).not.toHaveBeenCalled();
    });
  });
});
