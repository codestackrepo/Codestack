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

  /**
   * REVERSED in #118. An admin may now staff its own tenant.
   *
   * The previous rule allowed students only, so that a compromised org admin could
   * not manufacture teaching staff. That belonged to a platform where CodeStack
   * created every tenant by hand; organizations now apply for themselves and are
   * approved WITH per-role seat caps, after which routing every professor through
   * CodeStack support is a queue rather than a control.
   *
   * What bounds it now is `MAX_PROFESSORS` — a number a superadmin chose at approval —
   * plus tenancy and the `invited_by_id` audit trail. Hence the second assertion
   * below, which is the half of the old rule that still holds and matters more: an
   * admin still cannot mint a peer admin, so a single compromised account cannot
   * propagate its own level sideways.
   */
  it('an ADMIN may invite professors and students, but never another admin', () => {
    expect(mayInvite(Role.ADMIN, Role.STUDENT)).toBe(true);
    expect(mayInvite(Role.ADMIN, Role.PROFESSOR)).toBe(true);
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
