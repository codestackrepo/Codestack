import { ForbiddenException } from '@nestjs/common';
import { Role, ROLE_RANK } from '../../common/enums/role.enum';
import { assertMayInvite, INVITABLE_ROLES, mayInvite } from './invite-policy';

describe('invite policy', () => {
  const ALL = Object.values(Role);

  // The single most important assertion in this file. `RolesGuard` is
  // minimum-rank, so @Roles(PROFESSOR) admits ADMIN and SUPERADMIN, and
  // @IsEnum(Role) on the DTO happily accepts the string "superadmin". This matrix
  // is therefore the ONLY thing standing between a professor and
  // POST /invites {"role":"superadmin"}.
  it('nobody, at any tier, may invite a SUPERADMIN', () => {
    for (const actor of ALL) {
      expect(mayInvite(actor, Role.SUPERADMIN)).toBe(false);
      expect(() => assertMayInvite(actor, Role.SUPERADMIN)).toThrow(ForbiddenException);
    }
    for (const allowed of Object.values(INVITABLE_ROLES)) {
      expect(allowed).not.toContain(Role.SUPERADMIN);
    }
  });

  it('SUPERADMIN may invite admin, professor and student', () => {
    expect([...INVITABLE_ROLES[Role.SUPERADMIN]].sort()).toEqual(
      [Role.ADMIN, Role.PROFESSOR, Role.STUDENT].sort(),
    );
  });

  // Deliberate, not an oversight: staff onboarding is a SuperAdmin operation, so a
  // careless or compromised org admin cannot manufacture teaching staff inside
  // their own tenant. Promoting someone already in the org goes through
  // professor_requests instead.
  it('an ADMIN may invite only students — never a professor or another admin', () => {
    expect(mayInvite(Role.ADMIN, Role.STUDENT)).toBe(true);
    expect(mayInvite(Role.ADMIN, Role.PROFESSOR)).toBe(false);
    expect(mayInvite(Role.ADMIN, Role.ADMIN)).toBe(false);
  });

  it('a PROFESSOR may invite only students', () => {
    expect(mayInvite(Role.PROFESSOR, Role.STUDENT)).toBe(true);
    expect(mayInvite(Role.PROFESSOR, Role.PROFESSOR)).toBe(false);
    expect(mayInvite(Role.PROFESSOR, Role.ADMIN)).toBe(false);
  });

  it('a STUDENT may invite nobody', () => {
    expect(INVITABLE_ROLES[Role.STUDENT]).toHaveLength(0);
    for (const target of ALL) expect(mayInvite(Role.STUDENT, target)).toBe(false);
  });

  // Rank-monotonicity: nobody may mint an invite at or above their own rank,
  // which is what stops sideways privilege propagation.
  it('nobody may invite a role ranked at or above their own', () => {
    for (const actor of ALL) {
      for (const target of INVITABLE_ROLES[actor]) {
        expect(ROLE_RANK[target]).toBeLessThan(ROLE_RANK[actor]);
      }
    }
  });

  it('reports role_not_invitable rather than a bare message', () => {
    try {
      assertMayInvite(Role.PROFESSOR, Role.ADMIN);
      throw new Error('expected a throw');
    } catch (err) {
      expect((err as ForbiddenException).getResponse()).toMatchObject({
        reason: 'role_not_invitable',
      });
    }
  });

  it('the matrix is frozen — no runtime widening', () => {
    expect(Object.isFrozen(INVITABLE_ROLES)).toBe(true);
    expect(Object.isFrozen(INVITABLE_ROLES[Role.PROFESSOR])).toBe(true);
  });
});
