import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { Role } from '../../../common/enums/role.enum';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { FeatureKey } from '../enums/feature-key.enum';
import * as gatedRouters from '../feature-gated-routers';
import { FeatureGuard } from './feature.guard';

/** A stand-in controller class carrying Nest's path metadata. */
function controllerClass(path?: string): new () => unknown {
  class StubController {}
  if (path !== undefined) Reflect.defineMetadata(PATH_METADATA, path, StubController);
  return StubController;
}

function makeContext(
  user: Partial<AuthenticatedUser> | undefined,
  controllerPath?: string,
): ExecutionContext {
  const cls = controllerClass(controllerPath);
  return {
    getHandler: () => function handlerName() {},
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function reflectorFor(opts: { isPublic?: boolean; required?: FeatureKey }): Reflector {
  return {
    getAllAndOverride: jest.fn((key: string) =>
      key === IS_PUBLIC_KEY ? opts.isPublic : opts.required,
    ),
  } as unknown as Reflector;
}

const PROFESSOR = { id: 'p1', role: Role.PROFESSOR, organizationId: 'org-A' };

describe('FeatureGuard', () => {
  it('passes a @Public route without consulting the resolver', async () => {
    const access = { isEnabled: jest.fn() };
    const guard = new FeatureGuard(
      reflectorFor({ isPublic: true, required: FeatureKey.PROBLEMS_AUTHOR }),
      access as never,
    );
    await expect(guard.canActivate(makeContext(undefined))).resolves.toBe(true);
    expect(access.isEnabled).not.toHaveBeenCalled();
  });

  it('resolves the feature against the actor role + org and passes when enabled', async () => {
    const access = { isEnabled: jest.fn().mockResolvedValue(true) };
    const guard = new FeatureGuard(
      reflectorFor({ required: FeatureKey.ASSIGNMENTS_AUTHOR }),
      access as never,
    );
    await expect(guard.canActivate(makeContext(PROFESSOR))).resolves.toBe(true);
    expect(access.isEnabled).toHaveBeenCalledWith(
      FeatureKey.ASSIGNMENTS_AUTHOR,
      Role.PROFESSOR,
      'org-A',
    );
  });

  it('throws 403 entitlement_required — NOT module_disabled — when the feature is off', async () => {
    const access = { isEnabled: jest.fn().mockResolvedValue(false) };
    const guard = new FeatureGuard(
      reflectorFor({ required: FeatureKey.GRADING_PUBLISH }),
      access as never,
    );
    // The distinct reason is the contract: the UI disables a control in place here,
    // rather than redirecting away as it does for a disabled module.
    await expect(guard.canActivate(makeContext(PROFESSOR))).rejects.toMatchObject({
      response: { reason: 'entitlement_required', feature: FeatureKey.GRADING_PUBLISH },
    });
  });

  it('bypasses for superadmin without consulting the resolver', async () => {
    const access = { isEnabled: jest.fn() };
    const guard = new FeatureGuard(
      reflectorFor({ required: FeatureKey.PROBLEMS_GLOBAL }),
      access as never,
    );
    await expect(
      guard.canActivate(makeContext({ id: 's', role: Role.SUPERADMIN, organizationId: null })),
    ).resolves.toBe(true);
    expect(access.isEnabled).not.toHaveBeenCalled();
  });

  it('throws when metadata is present but there is no user', async () => {
    const access = { isEnabled: jest.fn() };
    const guard = new FeatureGuard(
      reflectorFor({ required: FeatureKey.PROBLEMS_AUTHOR }),
      access as never,
    );
    await expect(guard.canActivate(makeContext(undefined))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(access.isEnabled).not.toHaveBeenCalled();
  });
});

describe('FeatureGuard — un-annotated routes', () => {
  it('allows an un-annotated route on an ordinary controller', async () => {
    const access = { isEnabled: jest.fn() };
    const guard = new FeatureGuard(reflectorFor({}), access as never);
    await expect(guard.canActivate(makeContext(PROFESSOR, 'classrooms'))).resolves.toBe(true);
    expect(access.isEnabled).not.toHaveBeenCalled();
  });

  it('DENIES an un-annotated route on a controller that opted into fail-closed', async () => {
    // #65 populates the real list; this proves the mechanism it will switch on.
    jest.spyOn(gatedRouters, 'isFeatureGatedRouter').mockReturnValue(true);
    const guard = new FeatureGuard(reflectorFor({}), { isEnabled: jest.fn() } as never);
    await expect(guard.canActivate(makeContext(PROFESSOR, 'problems'))).rejects.toMatchObject({
      response: { reason: 'entitlement_required', feature: null },
    });
    jest.restoreAllMocks();
  });
});

describe('isFeatureGatedRouter', () => {
  const withPaths = (paths: string[], fn: () => void) => {
    const original = [...gatedRouters.FEATURE_GATED_ROUTER_PATHS];
    gatedRouters.FEATURE_GATED_ROUTER_PATHS.splice(0, Infinity, ...paths);
    try {
      fn();
    } finally {
      gatedRouters.FEATURE_GATED_ROUTER_PATHS.splice(0, Infinity, ...original);
    }
  };

  it('is empty in #64 so no existing route changes behaviour', () => {
    expect(gatedRouters.FEATURE_GATED_ROUTER_PATHS).toEqual([]);
    expect(gatedRouters.isFeatureGatedRouter('problems')).toBe(false);
  });

  it('matches a listed path exactly and as a path prefix, and tolerates slashes', () => {
    withPaths(['platform/organizations'], () => {
      expect(gatedRouters.isFeatureGatedRouter('platform/organizations')).toBe(true);
      expect(gatedRouters.isFeatureGatedRouter('/platform/organizations/')).toBe(true);
      expect(gatedRouters.isFeatureGatedRouter('platform/organizations/members')).toBe(true);
      // Not a path-segment boundary — must NOT match.
      expect(gatedRouters.isFeatureGatedRouter('platform/organizations-export')).toBe(false);
      expect(gatedRouters.isFeatureGatedRouter('platform')).toBe(false);
    });
  });

  it('returns false for a controller with no declared path', () => {
    withPaths(['problems'], () => {
      expect(gatedRouters.isFeatureGatedRouter(undefined)).toBe(false);
    });
  });
});
