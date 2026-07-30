import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrganizationCache } from '../../modules/organizations/organization-cache.service';
import { OrganizationStatus } from '../../modules/organizations/enums/organization.enums';
import { Role } from '../enums/role.enum';
import { AuthenticatedUser } from '../types/authenticated-user';
import { ALLOWS_UNASSIGNED_KEY } from '../decorators/allows-unassigned.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { TenantContextGuard } from './tenant-context.guard';

function makeContext(user?: Partial<AuthenticatedUser>): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

/**
 * Key-AWARE on purpose. The previous mock was `jest.fn(() => isPublic)`, which
 * returns the same answer for every metadata key — so once `@AllowsUnassigned`
 * existed it would have reported "allowed" for every `@Public` case and silently
 * turned the org-less rejection tests into no-ops.
 */
const reflectorFor = (opts: { isPublic?: boolean; allowsUnassigned?: boolean } = {}): Reflector =>
  ({
    getAllAndOverride: jest.fn((key: string) => {
      if (key === IS_PUBLIC_KEY) return opts.isPublic ?? false;
      if (key === ALLOWS_UNASSIGNED_KEY) return opts.allowsUnassigned ?? false;
      throw new Error(`unexpected metadata key: ${key}`);
    }),
  }) as unknown as Reflector;

const cacheFor = (status?: OrganizationStatus): OrganizationCache =>
  ({ getStatus: jest.fn(() => status) }) as unknown as OrganizationCache;

describe('TenantContextGuard', () => {
  it('passes @Public routes without a user', () => {
    const guard = new TenantContextGuard(reflectorFor({ isPublic: true }), cacheFor());
    expect(guard.canActivate(makeContext(undefined))).toBe(true);
  });

  it('passes a superadmin (org-less)', () => {
    const guard = new TenantContextGuard(reflectorFor({}), cacheFor());
    expect(guard.canActivate(makeContext({ role: Role.SUPERADMIN, organizationId: null }))).toBe(
      true,
    );
  });

  it('403 no_organization for a non-superadmin with no org (fail-closed)', () => {
    const guard = new TenantContextGuard(reflectorFor({}), cacheFor());
    expect(() =>
      guard.canActivate(makeContext({ role: Role.STUDENT, organizationId: null })),
    ).toThrow(ForbiddenException);
  });

  it('403 org_suspended for a member of a suspended org', () => {
    const guard = new TenantContextGuard(reflectorFor({}), cacheFor(OrganizationStatus.SUSPENDED));
    expect(() =>
      guard.canActivate(makeContext({ role: Role.PROFESSOR, organizationId: 'orgA' })),
    ).toThrow(ForbiddenException);
  });

  it('passes a member of an active org', () => {
    const guard = new TenantContextGuard(reflectorFor({}), cacheFor(OrganizationStatus.ACTIVE));
    expect(guard.canActivate(makeContext({ role: Role.PROFESSOR, organizationId: 'orgA' }))).toBe(
      true,
    );
  });

  it('throws when a non-public route has no user', () => {
    const guard = new TenantContextGuard(reflectorFor({}), cacheFor());
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });

  describe('@AllowsUnassigned (#104)', () => {
    it('lets an org-less user through a decorated handler', () => {
      const guard = new TenantContextGuard(reflectorFor({ allowsUnassigned: true }), cacheFor());
      expect(guard.canActivate(makeContext({ role: Role.STUDENT, organizationId: null }))).toBe(
        true,
      );
    });

    it('still rejects an org-less user on an UNdecorated handler', () => {
      const guard = new TenantContextGuard(reflectorFor({ allowsUnassigned: false }), cacheFor());
      expect(() =>
        guard.canActivate(makeContext({ role: Role.STUDENT, organizationId: null })),
      ).toThrow(ForbiddenException);
    });

    // No `role === STUDENT` sub-gate: a mis-provisioned org-less ADMIN would
    // otherwise 403 on /auth/verify and loop /login -> verify 403 -> /login with
    // no diagnostic anywhere.
    it('applies to any role, not just STUDENT', () => {
      const guard = new TenantContextGuard(reflectorFor({ allowsUnassigned: true }), cacheFor());
      for (const role of [Role.ADMIN, Role.PROFESSOR, Role.STUDENT]) {
        expect(guard.canActivate(makeContext({ role, organizationId: null }))).toBe(true);
      }
    });

    // getStatus(null) must never be reached — the org-less branch returns or
    // throws before the suspension lookup.
    it('never consults the org cache for an org-less user', () => {
      const cache = cacheFor(OrganizationStatus.SUSPENDED);
      const guard = new TenantContextGuard(reflectorFor({ allowsUnassigned: true }), cache);
      guard.canActivate(makeContext({ role: Role.STUDENT, organizationId: null }));
      expect(cache.getStatus).not.toHaveBeenCalled();
    });

    it('does NOT exempt a member of a suspended org — the decorator is only about having no org', () => {
      const guard = new TenantContextGuard(
        reflectorFor({ allowsUnassigned: true }),
        cacheFor(OrganizationStatus.SUSPENDED),
      );
      expect(() =>
        guard.canActivate(makeContext({ role: Role.STUDENT, organizationId: 'orgA' })),
      ).toThrow(ForbiddenException);
    });
  });
});
