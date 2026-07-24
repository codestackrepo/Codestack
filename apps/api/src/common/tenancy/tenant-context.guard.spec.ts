import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrganizationCache } from '../../modules/organizations/organization-cache.service';
import { OrganizationStatus } from '../../modules/organizations/enums/organization.enums';
import { Role } from '../enums/role.enum';
import { AuthenticatedUser } from '../types/authenticated-user';
import { TenantContextGuard } from './tenant-context.guard';

function makeContext(user?: Partial<AuthenticatedUser>): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

const reflectorFor = (isPublic: boolean): Reflector =>
  ({ getAllAndOverride: jest.fn(() => isPublic) }) as unknown as Reflector;

const cacheFor = (status?: OrganizationStatus): OrganizationCache =>
  ({ getStatus: jest.fn(() => status) }) as unknown as OrganizationCache;

describe('TenantContextGuard', () => {
  it('passes @Public routes without a user', () => {
    const guard = new TenantContextGuard(reflectorFor(true), cacheFor());
    expect(guard.canActivate(makeContext(undefined))).toBe(true);
  });

  it('passes a superadmin (org-less)', () => {
    const guard = new TenantContextGuard(reflectorFor(false), cacheFor());
    expect(
      guard.canActivate(makeContext({ role: Role.SUPERADMIN, organizationId: null })),
    ).toBe(true);
  });

  it('403 no_organization for a non-superadmin with no org (fail-closed)', () => {
    const guard = new TenantContextGuard(reflectorFor(false), cacheFor());
    expect(() =>
      guard.canActivate(makeContext({ role: Role.STUDENT, organizationId: null })),
    ).toThrow(ForbiddenException);
  });

  it('403 org_suspended for a member of a suspended org', () => {
    const guard = new TenantContextGuard(
      reflectorFor(false),
      cacheFor(OrganizationStatus.SUSPENDED),
    );
    expect(() =>
      guard.canActivate(makeContext({ role: Role.PROFESSOR, organizationId: 'orgA' })),
    ).toThrow(ForbiddenException);
  });

  it('passes a member of an active org', () => {
    const guard = new TenantContextGuard(reflectorFor(false), cacheFor(OrganizationStatus.ACTIVE));
    expect(
      guard.canActivate(makeContext({ role: Role.PROFESSOR, organizationId: 'orgA' })),
    ).toBe(true);
  });

  it('throws when a non-public route has no user', () => {
    const guard = new TenantContextGuard(reflectorFor(false), cacheFor());
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });
});
