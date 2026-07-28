import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { Role } from '../../../common/enums/role.enum';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { AppModuleKey } from '../enums/app-module-key.enum';
import { ModuleAccessGuard } from './module-access.guard';

function makeContext(user?: Partial<AuthenticatedUser>): ExecutionContext {
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
  const STUDENT = { id: 'u1', role: Role.STUDENT, organizationId: 'org-A' };

  it('passes when the route has no @RequiresModule metadata', async () => {
    const access = { isEnabled: jest.fn() };
    const guard = new ModuleAccessGuard(reflectorFor({}), access as never);
    await expect(guard.canActivate(makeContext(STUDENT))).resolves.toBe(true);
    expect(access.isEnabled).not.toHaveBeenCalled();
  });

  it('passes a @Public route even with no user', async () => {
    const access = { isEnabled: jest.fn() };
    const guard = new ModuleAccessGuard(
      reflectorFor({ isPublic: true, required: AppModuleKey.PROBLEMS }),
      access as never,
    );
    await expect(guard.canActivate(makeContext(undefined))).resolves.toBe(true);
    expect(access.isEnabled).not.toHaveBeenCalled();
  });

  it('bypasses for superadmin without consulting the service', async () => {
    const access = { isEnabled: jest.fn() };
    const guard = new ModuleAccessGuard(
      reflectorFor({ required: AppModuleKey.GRADING }),
      access as never,
    );
    await expect(
      guard.canActivate(makeContext({ id: 's', role: Role.SUPERADMIN, organizationId: null })),
    ).resolves.toBe(true);
    expect(access.isEnabled).not.toHaveBeenCalled();
  });

  it('consults the service for ADMIN and passes the org (no guard-level bypass left)', async () => {
    const access = { isEnabled: jest.fn().mockResolvedValue(true) };
    const guard = new ModuleAccessGuard(
      reflectorFor({ required: AppModuleKey.GRADING }),
      access as never,
    );
    await expect(
      guard.canActivate(makeContext({ id: 'a', role: Role.ADMIN, organizationId: 'org-A' })),
    ).resolves.toBe(true);
    expect(access.isEnabled).toHaveBeenCalledWith(AppModuleKey.GRADING, Role.ADMIN, 'org-A');
  });

  it('denies an ADMIN whose org had the module revoked (the #64 point)', async () => {
    const access = { isEnabled: jest.fn().mockResolvedValue(false) };
    const guard = new ModuleAccessGuard(
      reflectorFor({ required: AppModuleKey.PROBLEMS }),
      access as never,
    );
    await expect(
      guard.canActivate(makeContext({ id: 'a', role: Role.ADMIN, organizationId: 'org-A' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws module_disabled when the role has the module off', async () => {
    const access = { isEnabled: jest.fn().mockResolvedValue(false) };
    const guard = new ModuleAccessGuard(
      reflectorFor({ required: AppModuleKey.GRADING }),
      access as never,
    );
    await expect(guard.canActivate(makeContext(STUDENT))).rejects.toMatchObject({
      response: { reason: 'module_disabled', module: AppModuleKey.GRADING },
    });
  });

  it('passes when the module is enabled for the role', async () => {
    const access = { isEnabled: jest.fn().mockResolvedValue(true) };
    const guard = new ModuleAccessGuard(
      reflectorFor({ required: AppModuleKey.PROBLEMS }),
      access as never,
    );
    await expect(guard.canActivate(makeContext(STUDENT))).resolves.toBe(true);
  });

  it('throws when metadata present but no user (non-public)', async () => {
    const access = { isEnabled: jest.fn() };
    const guard = new ModuleAccessGuard(
      reflectorFor({ required: AppModuleKey.PROBLEMS }),
      access as never,
    );
    await expect(guard.canActivate(makeContext(undefined))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(access.isEnabled).not.toHaveBeenCalled();
  });
});
