import { ForbiddenException } from '@nestjs/common';
import { Role } from '../enums/role.enum';
import { COMMUNITY_ORG_ID } from '../../modules/organizations/organizations.constants';
import {
  assertOrgAllowsStaffDirectory,
  canReadStaffDirectory,
  isClaimableMember,
  isCommunityOrg,
} from './community-policy';

const REAL_ORG = '33333333-3333-3333-3333-333333333333';
const actor = (role: Role, organizationId: string | null) => ({ role, organizationId });

/**
 * The community tenant's whole cost, in one file.
 *
 * Making open members belong to a real `organizations` row bought a great deal —
 * no constraint surgery, working quotas, a representable open professor — at exactly
 * one price: that tenant's members are strangers, so the org-staff read surfaces
 * become a directory of the user base. These are the tests that keep the price paid.
 */
describe('assertOrgAllowsStaffDirectory', () => {
  // `POST /auth/professor-applications` is public, so an approved open professor is
  // an account an outsider can obtain. Without this the listing endpoints would make
  // "apply as a professor" a supported way to enumerate every open user.
  it.each([Role.PROFESSOR, Role.ADMIN, Role.STUDENT])(
    'refuses a %s whose org is the community tenant',
    (role) => {
      let err: unknown = null;
      try {
        assertOrgAllowsStaffDirectory(actor(role, COMMUNITY_ORG_ID));
      } catch (e) {
        err = e;
      }

      expect(err).toBeInstanceOf(ForbiddenException);
      expect(err).toMatchObject({ response: { reason: 'community_restricted' } });
    },
  );

  // The existing closed-ecosystem flows must be completely unaffected: inside a real
  // organization these surfaces are correct and stay correct.
  it.each([Role.ADMIN, Role.PROFESSOR, Role.STUDENT])(
    'allows a %s in a real organization',
    (role) => {
      expect(() => assertOrgAllowsStaffDirectory(actor(role, REAL_ORG))).not.toThrow();
    },
  );

  // The platform operator can already read every tenant through the platform console,
  // and moderating the open tenant is exactly the case most likely to need it.
  it('exempts the SUPERADMIN, including inside the community tenant', () => {
    expect(() =>
      assertOrgAllowsStaffDirectory(actor(Role.SUPERADMIN, COMMUNITY_ORG_ID)),
    ).not.toThrow();
    expect(() => assertOrgAllowsStaffDirectory(actor(Role.SUPERADMIN, null))).not.toThrow();
  });

  // Org-less is the legacy confined holding state, which predates all of this and is
  // already walled off by TenantContextGuard. It is not the community tenant.
  it('does not restrict an org-less actor — that is a different state', () => {
    expect(() => assertOrgAllowsStaffDirectory(actor(Role.STUDENT, null))).not.toThrow();
  });

  it('canReadStaffDirectory agrees with the assertion in every case', () => {
    const cases = [
      actor(Role.PROFESSOR, COMMUNITY_ORG_ID),
      actor(Role.ADMIN, COMMUNITY_ORG_ID),
      actor(Role.SUPERADMIN, COMMUNITY_ORG_ID),
      actor(Role.ADMIN, REAL_ORG),
      actor(Role.STUDENT, null),
    ];

    for (const a of cases) {
      let threw = false;
      try {
        assertOrgAllowsStaffDirectory(a);
      } catch {
        threw = true;
      }
      // If these ever disagree, one surface refuses while another quietly renders.
      expect(canReadStaffDirectory(a)).toBe(!threw);
    }
  });
});

describe('isCommunityOrg', () => {
  it('is true only for the community tenant id', () => {
    expect(isCommunityOrg(COMMUNITY_ORG_ID)).toBe(true);
    expect(isCommunityOrg(REAL_ORG)).toBe(false);
    expect(isCommunityOrg(null)).toBe(false);
    expect(isCommunityOrg(undefined)).toBe(false);
  });
});

/**
 * The one behaviour the community tenant would otherwise have broken.
 *
 * The invite machinery tested claimability as `organizationId === null`, written
 * before this tenant existed. Left alone, every open member would look like a settled
 * member of some other tenant — so a university inviting its own student who had
 * already self-signed-up would get the opaque `email_unavailable`, with no path
 * forward for either party.
 */
describe('isClaimableMember', () => {
  it('treats an open-platform member as claimable', () => {
    expect(isClaimableMember(COMMUNITY_ORG_ID)).toBe(true);
  });

  it('treats the legacy org-less holding state as claimable', () => {
    expect(isClaimableMember(null)).toBe(true);
    expect(isClaimableMember(undefined)).toBe(true);
  });

  // Cross-tenant opacity survives everywhere else: whether an address belongs to some
  // other institution is that institution's business, and a distinct answer here
  // would be an existence oracle for whoever holds an invite link.
  it('does NOT treat a member of a real organization as claimable', () => {
    expect(isClaimableMember(REAL_ORG)).toBe(false);
  });
});
