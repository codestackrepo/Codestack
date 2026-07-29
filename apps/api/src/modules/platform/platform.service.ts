import { Injectable, Logger } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ClerkService } from '../auth/clerk/clerk.service';
import { Organization } from '../organizations/entities/organization.entity';
import { OrganizationStatus } from '../organizations/enums/organization.enums';
import { OrganizationCache } from '../organizations/organization-cache.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { UsersService } from '../users/users.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import {
  OrgQuotaUsageDto,
  PlatformOrganizationDetailDto,
  QuotaUsageDto,
} from './dto/platform-organization-detail.dto';
import { OrgCountsDto, PlatformOrgTileDto, PlatformOverviewDto } from './dto/platform-overview.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { QuotaResource } from '../quotas/enums/quota-resource.enum';
import { QuotaService, QuotaUsageSummary } from '../quotas/quota.service';
import { PlatformMetricsService } from './platform-metrics.service';

/**
 * SuperAdmin platform operations (#62, #63). Orchestrates org CRUD across the local
 * tenant root (OrganizationsService), the Clerk Organization mirror (ClerkService),
 * and the status cache (OrganizationCache). The local row is authoritative for FK
 * integrity; Clerk mirroring is best-effort so the platform works with Clerk unset.
 * Cross-org read-side aggregation lives in PlatformMetricsService.
 */
@Injectable()
export class PlatformService {
  private readonly log = new Logger(PlatformService.name);

  constructor(
    private readonly orgs: OrganizationsService,
    private readonly orgCache: OrganizationCache,
    private readonly clerk: ClerkService,
    private readonly users: UsersService,
    private readonly metrics: PlatformMetricsService,
    private readonly quotas: QuotaService,
  ) {}

  list(): Promise<Organization[]> {
    return this.orgs.list();
  }

  /**
   * `GET /platform/overview` (#63) — one cross-org KPI block plus a tile per org.
   * The org list and the whole census are fetched concurrently, then joined in
   * memory, so adding an org never adds a query.
   */
  async overview(): Promise<PlatformOverviewDto> {
    const [orgs, census] = await Promise.all([this.orgs.list(), this.metrics.census()]);

    const tiles = orgs.map((org) =>
      PlatformOrgTileDto.from(org, census.byOrg[org.id] ?? OrgCountsDto.zero()),
    );
    // Totals are summed from the tiles rather than re-queried — the KPI header and
    // the grid below it are then arithmetically consistent by construction.
    const sum = (pick: (c: OrgCountsDto) => number): number =>
      tiles.reduce((acc, tile) => acc + pick(tile.counts), 0);
    const orgProblems = sum((c) => c.problems);

    return {
      generatedAt: new Date().toISOString(),
      organizations: {
        total: orgs.length,
        active: orgs.filter((o) => o.status === OrganizationStatus.ACTIVE).length,
        suspended: orgs.filter((o) => o.status === OrganizationStatus.SUSPENDED).length,
        clerkLinked: orgs.filter((o) => Boolean(o.clerkOrgId)).length,
      },
      users: {
        total: sum((c) => c.users) + census.platform.superAdmins,
        superAdmins: census.platform.superAdmins,
        admins: sum((c) => c.admins),
        professors: sum((c) => c.professors),
        students: sum((c) => c.students),
        // SuperAdmins are always active to reach this endpoint at all, but they are
        // counted from their own bucket so `active + inactive === total` holds.
        active: sum((c) => c.activeUsers) + census.platform.superAdmins,
        inactive: sum((c) => c.inactiveUsers),
        pendingInvites: sum((c) => c.pendingInvites),
      },
      content: {
        classrooms: sum((c) => c.classrooms),
        problems: {
          total: orgProblems + census.platform.globalProblems,
          global: census.platform.globalProblems,
          org: orgProblems,
        },
        assignments: sum((c) => c.assignments),
        submissions: sum((c) => c.submissions),
      },
      tiles,
    };
  }

  /**
   * `GET /platform/organizations/:id` (#63) — the org row plus its live census read
   * against quotas. 404s before counting when the id is unknown.
   */
  async detail(id: string): Promise<PlatformOrganizationDetailDto> {
    const org = await this.orgs.getById(id);
    const [counts, quotas] = await Promise.all([
      this.metrics.countsForOrg(id),
      this.quotas.getUsageSummary(id),
    ]);
    return PlatformOrganizationDetailDto.fromOrg(org, counts, this.usageFor(quotas));
  }

  /**
   * Counts vs quotas. Both numbers now come from QuotaService (#66), which owns the
   * limits AND the counting, so the console can never disagree with what enforcement
   * actually charges — the earlier version derived `used` from the census here, which
   * would have drifted the moment the two definitions diverged.
   *
   * `limit: null` still means UNLIMITED (no `org_quotas` row, or a NULL one) and is
   * never coalesced to 0, which means BLOCKED.
   */
  private usageFor(quotas: QuotaUsageSummary): OrgQuotaUsageDto {
    return {
      // Seats = active members + pending invites, so accepting an invite is
      // net-zero (invite pending->accepted -1, user +1).
      users: QuotaUsageDto.of(
        quotas[QuotaResource.MAX_USERS].used,
        quotas[QuotaResource.MAX_USERS].limit,
      ),
      // Global catalog problems are charged to no org (§5.4: global is exempt).
      problems: QuotaUsageDto.of(
        quotas[QuotaResource.MAX_PROBLEMS].used,
        quotas[QuotaResource.MAX_PROBLEMS].limit,
      ),
      assignments: QuotaUsageDto.of(
        quotas[QuotaResource.MAX_ASSIGNMENTS].used,
        quotas[QuotaResource.MAX_ASSIGNMENTS].limit,
      ),
    };
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
   * Best-effort Clerk Organization creation + linkage. An unlinked org
   * (clerk_org_id = NULL) is a fully supported state — the app runs with Clerk
   * off — so this never fails the request. Skipped (with a warning) when Clerk is
   * unconfigured or the acting SuperAdmin isn't Clerk-linked yet.
   *
   * On SUCCESS the organization.created webhook also fires and dedupes by slug, so
   * linkage is race-safe. On FAILURE of createOrganization no Clerk org exists, so
   * no webhook fires and clerk_org_id stays NULL until a manual re-provision. It is
   * NOT auto-healed; `clerkLinked: false` on the org detail/tile is how a SuperAdmin
   * spots it, and a re-provision endpoint is still a follow-up.
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
        `Clerk Organization creation failed for org ${org.id} — it stays unlinked ` +
          `(clerk_org_id NULL) until a manual re-provision: ${(err as Error).message}`,
      );
      // Local org remains authoritative + fully usable; no auto-backfill on failure.
    }
  }
}
