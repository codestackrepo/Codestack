import { ForbiddenException } from '@nestjs/common';
import { Role } from '../enums/role.enum';
import { COMMUNITY_ORG_ID } from '../../modules/organizations/organizations.constants';

/**
 * The price of the community tenant (#118), charged explicitly.
 *
 * Inside a real organization, PROFESSOR and above legitimately reads the member and
 * invite lists: they are colleagues at one institution, and a professor needs to see
 * who is in the tenant to teach them. The community tenant breaks that assumption in
 * the one way that matters — its members are mutually anonymous strangers who
 * happened to sign up on the same website. The SAME role-gated endpoints that are
 * correct in a university would, there, hand any open professor a directory of every
 * open user's name and email address.
 *
 * So the org-staff read surfaces are refused for that tenant. This is not a
 * theoretical hardening: `POST /auth/professor-applications` is a public endpoint,
 * and an approved open professor is therefore an account an outsider can obtain. The
 * lockout is what stops "apply as a professor" from being a supported way to
 * enumerate the user base.
 *
 * WHY THIS IS NOT A GUARD. It reads the ACTOR's own org, which the auth guard has
 * already re-stamped from the fresh DB row, so there is nothing to resolve — and a
 * decorator would have to be remembered on every new listing route, whereas the
 * service methods that do the listing are few and already funnel through
 * `scopeToOrg`. Calling it explicitly at those points keeps the refusal next to the
 * query it is refusing.
 *
 * SUPERADMIN is exempt. The platform operator can already read every tenant through
 * the platform console (#62/#63); pretending otherwise here would break moderation
 * of the very tenant most likely to need it.
 */
export function assertOrgAllowsStaffDirectory(actor: {
  role: Role;
  organizationId: string | null;
}): void {
  if (actor.role === Role.SUPERADMIN) return;
  if (actor.organizationId !== COMMUNITY_ORG_ID) return;

  throw new ForbiddenException({
    reason: 'community_restricted',
    message:
      'Member directories are not available on the open platform. This is only available inside an organization.',
  });
}

/**
 * Whether the actor may see org-staff surfaces at all — the same rule as
 * `assertOrgAllowsStaffDirectory`, as a predicate.
 *
 * Exists for the places that must SHAPE a response rather than refuse it: hiding a
 * nav item or omitting a field, where throwing would break a page that is otherwise
 * legitimate. Kept next to the assertion so the two cannot drift into disagreeing
 * about who is restricted.
 */
export function canReadStaffDirectory(actor: {
  role: Role;
  organizationId: string | null;
}): boolean {
  return actor.role === Role.SUPERADMIN || actor.organizationId !== COMMUNITY_ORG_ID;
}

/** Whether this organization id is the community tenant. */
export function isCommunityOrg(organizationId: string | null | undefined): boolean {
  return organizationId === COMMUNITY_ORG_ID;
}

/**
 * Whether a member can still be CLAIMED into a real organization (#118).
 *
 * Two states qualify, and they mean the same thing to an inviting organization —
 * "this person has an account but no institution":
 *
 *   organizationId === null            the legacy confined holding state
 *   organizationId === community org   an open-platform self-signup
 *
 * The invite machinery had exactly one test for this, `organizationId === null`,
 * written before the community tenant existed. Left alone, every open member would
 * look like a settled member of some other tenant, so a university inviting one of
 * its own students who had already signed up on their own would get the opaque
 * `email_unavailable` and have no way forward at all. That is the single behaviour
 * the community tenant would otherwise have broken.
 *
 * The cross-tenant opacity it replaces still holds everywhere else: real-org to
 * real-org stays `email_unavailable`, because whether an address belongs to some
 * other institution is that institution's business. The community tenant is the one
 * deliberate exception, and it is safe precisely because it is nobody's institution.
 */
export function isClaimableMember(organizationId: string | null | undefined): boolean {
  return organizationId === null || organizationId === undefined || isCommunityOrg(organizationId);
}
