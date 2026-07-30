import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../enums/role.enum';
import { RolesGuard } from './roles.guard';

function makeContext(user?: { id: string; role: Role }): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function reflectorFor(required?: Role[]): Reflector {
  return { getAllAndOverride: jest.fn(() => required) } as unknown as Reflector;
}

describe('RolesGuard (rank-aware)', () => {
  it('passes when the route has no @Roles metadata', () => {
    const guard = new RolesGuard(reflectorFor(undefined));
    expect(guard.canActivate(makeContext({ id: 'u', role: Role.STUDENT }))).toBe(true);
  });

  it('superadmin passes every gate, including @Roles(ADMIN)', () => {
    const guard = new RolesGuard(reflectorFor([Role.ADMIN]));
    expect(guard.canActivate(makeContext({ id: 's', role: Role.SUPERADMIN }))).toBe(true);
  });

  it('admin passes @Roles(ADMIN) and @Roles(ADMIN, PROFESSOR) (behaviour-preserving)', () => {
    expect(
      new RolesGuard(reflectorFor([Role.ADMIN])).canActivate(
        makeContext({ id: 'a', role: Role.ADMIN }),
      ),
    ).toBe(true);
    expect(
      new RolesGuard(reflectorFor([Role.ADMIN, Role.PROFESSOR])).canActivate(
        makeContext({ id: 'a', role: Role.ADMIN }),
      ),
    ).toBe(true);
  });

  it('admin is BLOCKED from @Roles(SUPERADMIN)', () => {
    const guard = new RolesGuard(reflectorFor([Role.SUPERADMIN]));
    expect(() => guard.canActivate(makeContext({ id: 'a', role: Role.ADMIN }))).toThrow(
      ForbiddenException,
    );
  });

  it('professor passes @Roles(ADMIN, PROFESSOR) but is blocked from @Roles(ADMIN)', () => {
    expect(
      new RolesGuard(reflectorFor([Role.ADMIN, Role.PROFESSOR])).canActivate(
        makeContext({ id: 'p', role: Role.PROFESSOR }),
      ),
    ).toBe(true);
    expect(() =>
      new RolesGuard(reflectorFor([Role.ADMIN])).canActivate(
        makeContext({ id: 'p', role: Role.PROFESSOR }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('student is blocked from staff routes', () => {
    const guard = new RolesGuard(reflectorFor([Role.ADMIN, Role.PROFESSOR]));
    expect(() => guard.canActivate(makeContext({ id: 'st', role: Role.STUDENT }))).toThrow(
      ForbiddenException,
    );
  });

  it('throws when metadata is present but there is no user', () => {
    const guard = new RolesGuard(reflectorFor([Role.ADMIN]));
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });
});
