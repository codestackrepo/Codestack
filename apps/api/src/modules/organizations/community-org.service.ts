import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from './entities/organization.entity';
import { OrganizationType } from './enums/organization.enums';
import { COMMUNITY_ORG_ID } from './organizations.constants';

/**
 * The platform-operated community tenant (#118).
 *
 * Thin on purpose: it answers "which org do open users belong to" and "is this org
 * the community one", and nothing else. The id is a compile-time constant
 * (`COMMUNITY_ORG_ID`) created by migration 1785610000000, so this is not a cache
 * over a lookup — there is nothing to look up.
 *
 * What it does add is a BOOT-TIME EXISTENCE CHECK. Every open signup writes a user
 * row pointing at this id, so if the row is missing the failure would otherwise be a
 * foreign-key violation on a public endpoint — a 500 for the user, and an error
 * message that says nothing about the real cause. Checking once at startup turns
 * "the community org was never created in this environment" into a single clear log
 * line at the moment a deploy is being watched.
 *
 * It warns rather than throws, and that is a deliberate trade: refusing to boot
 * would take down every unrelated feature (submissions, grading, classrooms) over a
 * subsystem that only self-signup needs. A platform that cannot accept new open
 * signups but still serves its existing tenants is strictly better than one that is
 * down.
 */
@Injectable()
export class CommunityOrgService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CommunityOrgService.name);

  constructor(
    @InjectRepository(Organization)
    private readonly organizations: Repository<Organization>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const org = await this.organizations.findOne({ where: { id: COMMUNITY_ORG_ID } });

    if (!org) {
      this.logger.error(
        `The CodeStack Community organization (${COMMUNITY_ORG_ID}) is MISSING. Open-platform ` +
          `signup and professor applications will fail until migrations are run — ` +
          `AddCommunityOrg1785610000000 creates it.`,
      );
      return;
    }
    if (org.type !== OrganizationType.COMMUNITY) {
      // Someone edited the row. Worth shouting about: the frontend decides whether to
      // render a co-branded ecosystem from this type, so a community tenant typed as
      // a university would present a lockup for an institution nobody joined, and the
      // staff-directory lockout would stop applying to a tenant of strangers.
      this.logger.error(
        `Organization ${COMMUNITY_ORG_ID} exists but its type is "${org.type}", not ` +
          `"${OrganizationType.COMMUNITY}". The community-tenant restrictions key off that type, ` +
          `so open members are currently treated as members of an ordinary organization.`,
      );
    }
  }

  /** The tenant every open-platform member belongs to. */
  get id(): string {
    return COMMUNITY_ORG_ID;
  }

  /**
   * Whether an organization id is the community tenant.
   *
   * Takes `string | null` so callers can pass a user's `organizationId` straight in
   * without a null dance. NULL is not the community tenant — an org-less user is in
   * the legacy confined holding state, which is a different thing that predates this.
   */
  isCommunity(organizationId: string | null | undefined): boolean {
    return organizationId === COMMUNITY_ORG_ID;
  }
}
