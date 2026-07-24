import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { Role } from '../../../common/enums/role.enum';
import { AppModuleKey } from '../enums/app-module-key.enum';
import { ModuleAccessGuard } from './module-access.guard';

function makeContext(user?: { id: string; role: Role }): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

/** Reflector that returns `isPublic` for IS_PUBLIC_KEY and `required` for MODULE_KEY. */
function reflectorFor(opts: { isPublic?: boolean; required?: AppModuleKey }): Reflector {
  return {
    getAllAndOverride: jest.fn((key: string) =>
      key === IS_PUBLIC_KEY ? opts.isPublic : opts.required,
    ),
  } as unknown as Reflector;
}

describe('ModuleAccessGuard', () => {
  const STUDENT = { id: 'u1', role: Role.STUDENT };

  it('passes when the route has no @RequiresModule metadata', () => {
    const access = { isEnabled: jest.fn() };
    const guard = new ModuleAccessGuard(reflectorFor({}), access as never);
    expect(guard.canActivate(makeContext(STUDENT))).toBe(true);
    expect(access.isEnabled).not.toHaveBeenCalled();
  });

  it('passes a @Public route even with no user', () => {
    const access = { isEnabled: jest.fn() };
    const guard = new ModuleAccessGuard(
      reflectorFor({ isPublic: true, required: AppModuleKey.PROBLEMS }),
      access as never,
    );
    expect(guard.canActivate(makeContext(undefined))).toBe(true);
    expect(access.isEnabled).not.toHaveBeenCalled();
  });

  it('bypasses for admin without consulting the service', () => {
    const access = { isEnabled: jest.fn() };
    const guard = new ModuleAccessGuard(
      reflectorFor({ required: AppModuleKey.GRADING }),
      access as never,
    );
    expect(guard.canActivate(makeContext({ id: 'a', role: Role.ADMIN }))).toBe(true);
    expect(access.isEnabled).not.toHaveBeenCalled();
  });

  it('throws module_disabled when the role has the module off', () => {
    const access = { isEnabled: jest.fn().mockReturnValue(false) };
    const guard = new ModuleAccessGuard(
      reflectorFor({ required: AppModuleKey.GRADING }),
      access as never,
    );
    expect(() => guard.canActivate(makeContext(STUDENT))).toThrow(ForbiddenException);
    try {
      guard.canActivate(makeContext(STUDENT));
    } catch (e) {
      expect((e as ForbiddenException).getResponse()).toMatchObject({
        reason: 'module_disabled',
        module: AppModuleKey.GRADING,
      });
    }
  });

  it('passes when the module is enabled for the role', () => {
    const access = { isEnabled: jest.fn().mockReturnValue(true) };
    const guard = new ModuleAccessGuard(
      reflectorFor({ required: AppModuleKey.PROBLEMS }),
      access as never,
    );
    expect(guard.canActivate(makeContext(STUDENT))).toBe(true);
  });

  it('throws when metadata present but no user (non-public)', () => {
    const access = { isEnabled: jest.fn() };
    const guard = new ModuleAccessGuard(
      reflectorFor({ required: AppModuleKey.PROBLEMS }),
      access as never,
    );
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
    expect(access.isEnabled).not.toHaveBeenCalled();
  });
});
