import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../../common/enums/role.enum';
import { User } from '../../users/entities/user.entity';
import { UsersService } from '../../users/users.service';
import { JwtAuthGuard } from './jwt-auth.guard';

// super.canActivate() belongs to the AuthGuard('jwt') mixin one link up the chain.
const superProto = Object.getPrototypeOf(JwtAuthGuard.prototype);

function context(request: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

const row = (over: Partial<User> = {}): User =>
  ({
    id: 'local-1',
    email: 'a@x.dev',
    role: Role.STUDENT,
    organizationId: 'org-1',
    isActive: true,
    ...over,
  }) as User;

describe('JwtAuthGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let users: { findById: jest.Mock };
  let guard: JwtAuthGuard;
  let superSpy: jest.SpyInstance;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    users = { findById: jest.fn() };
    guard = new JwtAuthGuard(reflector as unknown as Reflector, users as unknown as UsersService);
    superSpy = jest.spyOn(superProto, 'canActivate');
  });

  afterEach(() => jest.restoreAllMocks());

  it('short-circuits @Public routes without touching the cookie strategy or the DB', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    await expect(guard.canActivate(context({ headers: {} }))).resolves.toBe(true);
    expect(superSpy).not.toHaveBeenCalled();
    expect(users.findById).not.toHaveBeenCalled();
  });

  it('runs passport then enforces the isActive kill-switch via a fresh DB read', async () => {
    superSpy.mockResolvedValue(true);
    users.findById.mockResolvedValue(row({ id: 'l3' }));
    const req = { headers: {}, user: { id: 'l3' } };
    await expect(guard.canActivate(context(req))).resolves.toBe(true);
    expect(users.findById).toHaveBeenCalledWith('l3');
  });

  it('rejects when the DB says the account is disabled', async () => {
    superSpy.mockResolvedValue(true);
    users.findById.mockResolvedValue(row({ id: 'l3', isActive: false }));
    const req = { headers: {}, user: { id: 'l3' } };
    await expect(guard.canActivate(context(req))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when the token names a user who no longer exists', async () => {
    superSpy.mockResolvedValue(true);
    users.findById.mockResolvedValue(null);
    const req = { headers: {}, user: { id: 'deleted' } };
    await expect(guard.canActivate(context(req))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns false without a DB read when passport rejects the cookie', async () => {
    superSpy.mockResolvedValue(false);
    const req = { headers: {}, user: undefined };
    await expect(guard.canActivate(context(req))).resolves.toBe(false);
    expect(users.findById).not.toHaveBeenCalled();
  });

  // The reason this guard exists rather than the one-line @Public wrapper it
  // replaced: role/org come from the row, not the token, so revoke, assignment
  // and role change bind on the very next request.
  it('re-projects request.user from the fresh row, overriding stale token claims', async () => {
    superSpy.mockResolvedValue(true);
    users.findById.mockResolvedValue(
      row({ id: 'l4', email: 'new@x.dev', role: Role.PROFESSOR, organizationId: 'org-new' }),
    );
    const req: Record<string, unknown> = {
      headers: {},
      // What the token said when it was minted: org-less student.
      user: { id: 'l4', email: 'old@x.dev', role: Role.STUDENT, organizationId: null },
    };
    await expect(guard.canActivate(context(req))).resolves.toBe(true);
    expect(req.user).toEqual({
      id: 'l4',
      email: 'new@x.dev',
      role: Role.PROFESSOR,
      organizationId: 'org-new',
    });
  });

  it('answers 401, not 500, when the token sub is not a uuid (driver throws)', async () => {
    superSpy.mockResolvedValue(true);
    users.findById.mockRejectedValue(new Error('invalid input syntax for type uuid'));
    const req = { headers: {}, user: { id: 'not-a-uuid' } };
    await expect(guard.canActivate(context(req))).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
