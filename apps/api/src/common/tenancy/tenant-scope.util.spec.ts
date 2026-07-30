import { ForbiddenException } from '@nestjs/common';
import { SelectQueryBuilder } from 'typeorm';
import { Role } from '../enums/role.enum';
import { AuthenticatedUser } from '../types/authenticated-user';
import { assertSameOrg, isSuperAdmin, scopeToOrg } from './tenant-scope.util';

const actor = (over: Partial<AuthenticatedUser> = {}): AuthenticatedUser => ({
  id: 'u1',
  email: 'u@x.io',
  role: Role.PROFESSOR,
  organizationId: 'orgA',
  ...over,
});

type MockQb = SelectQueryBuilder<Record<string, unknown>> & {
  calls: Array<{ sql: string; params: Record<string, unknown> }>;
  andWhere: jest.Mock;
};

function makeQb(): MockQb {
  const calls: MockQb['calls'] = [];
  const andWhere = jest.fn((sql: string, params: Record<string, unknown>) => {
    calls.push({ sql, params });
    return qb;
  });
  const qb = { calls, andWhere } as unknown as MockQb;
  return qb;
}

describe('scopeToOrg', () => {
  it('bounds a non-superadmin to its own org', () => {
    const qb = makeQb();
    scopeToOrg(qb, 'p', actor({ organizationId: 'orgA' }));
    expect(qb.calls).toHaveLength(1);
    expect(qb.calls[0].sql).toBe('p.organizationId = :__scopeActorOrg');
    expect(qb.calls[0].params).toEqual({ __scopeActorOrg: 'orgA' });
  });

  it('unions global rows when includeGlobal is set', () => {
    const qb = makeQb();
    scopeToOrg(qb, 'p', actor(), { includeGlobal: true });
    expect(qb.calls[0].sql).toBe(
      '(p.organizationId = :__scopeActorOrg OR p.organizationId IS NULL)',
    );
  });

  it('does not filter for a superadmin', () => {
    const qb = makeQb();
    scopeToOrg(qb, 'p', actor({ role: Role.SUPERADMIN, organizationId: null }));
    expect(qb.andWhere).not.toHaveBeenCalled();
  });

  it('narrows a superadmin to one org when overrideOrgId is given', () => {
    const qb = makeQb();
    scopeToOrg(qb, 'p', actor({ role: Role.SUPERADMIN, organizationId: null }), {
      overrideOrgId: 'orgB',
    });
    expect(qb.calls[0].params).toEqual({ __scopeOverrideOrg: 'orgB' });
  });

  it('a null-org NON-superadmin filters to NULL (matches nothing) — never bypasses', () => {
    const qb = makeQb();
    scopeToOrg(qb, 'p', actor({ role: Role.STUDENT, organizationId: null }));
    expect(qb.calls[0].params).toEqual({ __scopeActorOrg: null });
  });

  it('respects a custom column name', () => {
    const qb = makeQb();
    scopeToOrg(qb, 's', actor(), { column: 'orgId' });
    expect(qb.calls[0].sql).toBe('s.orgId = :__scopeActorOrg');
  });
});

describe('assertSameOrg', () => {
  it('passes when the target is the actor org', () => {
    expect(() => assertSameOrg(actor({ organizationId: 'orgA' }), 'orgA')).not.toThrow();
  });
  it('throws on a cross-org target', () => {
    expect(() => assertSameOrg(actor({ organizationId: 'orgA' }), 'orgB')).toThrow(
      ForbiddenException,
    );
  });
  it('superadmin may reference any org', () => {
    expect(() =>
      assertSameOrg(actor({ role: Role.SUPERADMIN, organizationId: null }), 'orgB'),
    ).not.toThrow();
  });
});

describe('isSuperAdmin', () => {
  it('is true only for SUPERADMIN', () => {
    expect(isSuperAdmin(actor({ role: Role.SUPERADMIN }))).toBe(true);
    expect(isSuperAdmin(actor({ role: Role.ADMIN }))).toBe(false);
  });
});
