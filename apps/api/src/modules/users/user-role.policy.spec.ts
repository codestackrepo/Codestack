import { ForbiddenException } from '@nestjs/common';
import { Role, ROLE_RANK } from '../../common/enums/role.enum';
import {
  ASSIGNABLE_ROLES,
  assertAssignableRole,
  assertCanToggleAccess,
  mayAssignRole,
} from './user-role.policy';

const ALL = Object.values(Role);
const actor = (role: Role, over: Partial<{ id: string; organizationId: string | null }> = {}) => ({
  id: 'actor-1',
  role,
  organizationId: 'orgA' as string | null,
  ...over,
});

describe('mayAssignRole', () => {
  // THE regression. `POST /users {"role":"superadmin"}` and PATCH both honoured
  // this for any ADMIN actor, and the resulting SuperAdmin inherited every
  // isSuperAdmin() bypass in tenant-scope.util — read and write on every tenant.
  it('never lets anyone assign SUPERADMIN, including a SUPERADMIN', () => {
    for (const role of ALL) {
      expect(mayAssignRole({ role }, Role.SUPERADMIN)).toBe(false);
      expect(() => assertAssignableRole({ role }, Role.SUPERADMIN)).toThrow(ForbiddenException);
    }
  });

  it('keeps superadmin out of the DTO allowlist too', () => {
    expect(ASSIGNABLE_ROLES).not.toContain(Role.SUPERADMIN);
    expect(Object.isFrozen(ASSIGNABLE_ROLES)).toBe(true);
  });

  it('lets a SUPERADMIN assign every non-superadmin role', () => {
    for (const role of ASSIGNABLE_ROLES) {
      expect(mayAssignRole({ role: Role.SUPERADMIN }, role)).toBe(true);
    }
  });

  // Rank-monotonic: an ADMIN minting another ADMIN, or a PROFESSOR minting a
  // PROFESSOR, propagates a compromised account's own level sideways.
  it('refuses any role ranked at or above a non-superadmin actor', () => {
    expect(mayAssignRole({ role: Role.ADMIN }, Role.ADMIN)).toBe(false);
    expect(mayAssignRole({ role: Role.PROFESSOR }, Role.PROFESSOR)).toBe(false);
    expect(mayAssignRole({ role: Role.PROFESSOR }, Role.ADMIN)).toBe(false);
    expect(mayAssignRole({ role: Role.STUDENT }, Role.STUDENT)).toBe(false);
  });

  it('permits strictly-below assignments', () => {
    expect(mayAssignRole({ role: Role.ADMIN }, Role.PROFESSOR)).toBe(true);
    expect(mayAssignRole({ role: Role.ADMIN }, Role.STUDENT)).toBe(true);
    expect(mayAssignRole({ role: Role.PROFESSOR }, Role.STUDENT)).toBe(true);
  });

  it('is consistent with ROLE_RANK for every pair', () => {
    for (const a of ALL) {
      for (const t of ALL) {
        const expected =
          t !== Role.SUPERADMIN && (a === Role.SUPERADMIN || ROLE_RANK[t] < ROLE_RANK[a]);
        expect(mayAssignRole({ role: a }, t)).toBe(expected);
      }
    }
  });

  it('reports role_not_assignable', () => {
    try {
      assertAssignableRole({ role: Role.ADMIN }, Role.SUPERADMIN);
      throw new Error('expected a throw');
    } catch (err) {
      expect((err as ForbiddenException).getResponse()).toMatchObject({
        reason: 'role_not_assignable',
      });
    }
  });
});

describe('assertCanToggleAccess', () => {
  const noop = () => undefined;
  const target = (role: Role, id = 'target-1') => ({ id, role });

  // Applies to EVERY role, superadmin included. Revoking your own access has no
  // in-app undo, and a locked-out sole SuperAdmin cannot be recovered at all.
  it('refuses self-revocation for every role', () => {
    for (const role of ALL) {
      expect(() =>
        assertCanToggleAccess(actor(role, { id: 'same' }), target(role, 'same'), noop),
      ).toThrow(ForbiddenException);
    }
  });

  it('reports cannot_revoke_self, distinctly from a rank refusal', () => {
    try {
      assertCanToggleAccess(actor(Role.ADMIN, { id: 'x' }), target(Role.STUDENT, 'x'), noop);
      throw new Error('expected a throw');
    } catch (err) {
      expect((err as ForbiddenException).getResponse()).toMatchObject({
        reason: 'cannot_revoke_self',
      });
    }
  });

  it('lets a SUPERADMIN toggle anyone else, in any org', () => {
    for (const role of ALL) {
      expect(() =>
        assertCanToggleAccess(actor(Role.SUPERADMIN, { organizationId: null }), target(role), noop),
      ).not.toThrow();
    }
  });

  it('runs the same-org assertion for a non-superadmin', () => {
    const sameOrg = jest.fn();
    assertCanToggleAccess(actor(Role.ADMIN), target(Role.STUDENT), sameOrg);
    expect(sameOrg).toHaveBeenCalled();
  });

  it('propagates a cross-org rejection from the caller', () => {
    const sameOrg = jest.fn(() => {
      throw new ForbiddenException({ reason: 'cross_org' });
    });
    expect(() => assertCanToggleAccess(actor(Role.ADMIN), target(Role.STUDENT), sameOrg)).toThrow(
      ForbiddenException,
    );
  });

  it('lets an ADMIN toggle students and professors', () => {
    for (const role of [Role.STUDENT, Role.PROFESSOR]) {
      expect(() => assertCanToggleAccess(actor(Role.ADMIN), target(role), noop)).not.toThrow();
    }
  });

  // Otherwise two admins in one org can disable each other, and the last one
  // standing wins a race nobody intended to run.
  it('refuses an ADMIN toggling a peer ADMIN', () => {
    expect(() => assertCanToggleAccess(actor(Role.ADMIN), target(Role.ADMIN), noop)).toThrow(
      ForbiddenException,
    );
  });

  it('lets a PROFESSOR toggle only students', () => {
    expect(() =>
      assertCanToggleAccess(actor(Role.PROFESSOR), target(Role.STUDENT), noop),
    ).not.toThrow();
    for (const role of [Role.PROFESSOR, Role.ADMIN]) {
      expect(() => assertCanToggleAccess(actor(Role.PROFESSOR), target(role), noop)).toThrow(
        ForbiddenException,
      );
    }
  });

  it('lets a STUDENT toggle nobody', () => {
    for (const role of ALL) {
      expect(() => assertCanToggleAccess(actor(Role.STUDENT), target(role), noop)).toThrow(
        ForbiddenException,
      );
    }
  });
});
