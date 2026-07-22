import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Entitlement } from '../enums/billing.enums';
import { EntitlementGuard } from './entitlement.guard';

function makeContext(user?: { id: string }): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('EntitlementGuard', () => {
  it('allows the request through when the route has no @RequiresEntitlement() metadata', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const entitlements = { hasActiveEntitlement: jest.fn() };
    const guard = new EntitlementGuard(reflector, entitlements as any);

    await expect(guard.canActivate(makeContext({ id: 'user-1' }))).resolves.toBe(true);
    expect(entitlements.hasActiveEntitlement).not.toHaveBeenCalled();
  });

  it('throws Forbidden with a machine-readable reason when the user lacks the entitlement', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(Entitlement.AI),
    } as unknown as Reflector;
    const entitlements = { hasActiveEntitlement: jest.fn().mockResolvedValue(false) };
    const guard = new EntitlementGuard(reflector, entitlements as any);

    await expect(guard.canActivate(makeContext({ id: 'user-1' }))).rejects.toMatchObject({
      response: { reason: 'entitlement_required', entitlement: Entitlement.AI },
    });
  });

  it('allows the request through when the user has the entitlement', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(Entitlement.AI),
    } as unknown as Reflector;
    const entitlements = { hasActiveEntitlement: jest.fn().mockResolvedValue(true) };
    const guard = new EntitlementGuard(reflector, entitlements as any);

    await expect(guard.canActivate(makeContext({ id: 'user-1' }))).resolves.toBe(true);
  });

  it('throws Forbidden when the route requires an entitlement but there is no authenticated user', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(Entitlement.AI),
    } as unknown as Reflector;
    const entitlements = { hasActiveEntitlement: jest.fn() };
    const guard = new EntitlementGuard(reflector, entitlements as any);

    await expect(guard.canActivate(makeContext(undefined))).rejects.toThrow(ForbiddenException);
    expect(entitlements.hasActiveEntitlement).not.toHaveBeenCalled();
  });
});
