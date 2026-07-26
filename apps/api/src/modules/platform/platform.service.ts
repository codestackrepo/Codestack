import { Injectable, Logger } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ClerkService } from '../auth/clerk/clerk.service';
import { Organization } from '../organizations/entities/organization.entity';
import { OrganizationStatus } from '../organizations/enums/organization.enums';
import { OrganizationCache } from '../organizations/organization-cache.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { UsersService } from '../users/users.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

/**
 * SuperAdmin platform operations (#62). Orchestrates org CRUD across the local
 * tenant root (OrganizationsService), the Clerk Organization mirror (ClerkService),
 * and the status cache (OrganizationCache). The local row is authoritative for FK
 * integrity; Clerk mirroring is best-effort so the platform works with Clerk unset.
 */
@Injectable()
export class PlatformService {
  private readonly log = new Logger(PlatformService.name);

  constructor(
    private readonly orgs: OrganizationsService,
    private readonly orgCache: OrganizationCache,
    private readonly clerk: ClerkService,
    private readonly users: UsersService,
  ) {}

  list(): Promise<Organization[]> {
    return this.orgs.list();
  }

  getById(id: string): Promise<Organization> {
    return this.orgs.getById(id);
  }

  async create(dto: CreateOrganizationDto, actor: AuthenticatedUser): Promise<Organization> {
    const org = await this.orgs.create({
      name: dto.name,
      slug: dto.slug,
      type: dto.type,
      createdById: actor.id,
    });
    await this.provisionClerkOrg(org, actor);
    await this.orgCache.reload(); // pick up the new (active) org for the status guard
    return this.orgs.getById(org.id); // re-read so clerkLinked reflects any linkage
  }

  update(id: string, dto: UpdateOrganizationDto): Promise<Organization> {
    return this.orgs.update(id, dto);
  }

  async suspend(id: string): Promise<Organization> {
    const org = await this.orgs.setStatus(id, OrganizationStatus.SUSPENDED);
    await this.orgCache.reload(); // suspension must take effect for the status guard
    return org;
  }

  async activate(id: string): Promise<Organization> {
    const org = await this.orgs.setStatus(id, OrganizationStatus.ACTIVE);
    await this.orgCache.reload();
    return org;
  }

  /**
   * Best-effort Clerk Organization creation + linkage. Skipped (with a warning,
   * never a failed request) when Clerk is unconfigured or the acting SuperAdmin
   * isn't Clerk-linked yet — the local org stands and a later reconcile / the
   * organization.created webhook links clerk_org_id (the webhook dedupes by slug).
   */
  private async provisionClerkOrg(org: Organization, actor: AuthenticatedUser): Promise<void> {
    if (!this.clerk.isConfigured() || org.clerkOrgId) return;

    const admin = await this.users.findById(actor.id);
    if (!admin?.clerkUserId) {
      this.log.warn(
        `Org ${org.id} created without a Clerk Organization — SuperAdmin ${actor.id} has no clerk_user_id yet`,
      );
      return;
    }

    try {
      const clerkOrg = await this.clerk.createOrganization({
        name: org.name,
        slug: org.slug,
        createdBy: admin.clerkUserId,
      });
      await this.orgs.attachClerkOrgId(org.id, clerkOrg.id);
    } catch (err) {
      this.log.error(
        `Clerk Organization creation failed for org ${org.id}: ${(err as Error).message}`,
      );
      // Local org remains authoritative; clerk_org_id backfills later.
    }
  }
}
