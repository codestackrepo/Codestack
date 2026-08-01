import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Platform } from './decorators/platform.decorator';
import { SYSTEM_MODULES, TOGGLEABLE_MODULES } from '../module-access/enums/app-module-key.enum';
import { ALL_FEATURES } from '../module-access/enums/feature-key.enum';
import { ModuleAccessService } from '../module-access/module-access.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { QuotaResource } from '../quotas/enums/quota-resource.enum';
import { QuotaService } from '../quotas/quota.service';
import { QuotaUsageDto } from './dto/platform-organization-detail.dto';
import {
  OrgMatrixResponseDto,
  OrgQuotaResponseDto,
  UpdateOrgMatrixBulkDto,
  SetOrgQuotaDto,
  UpdateOrgMatrixCellDto,
} from './dto/platform-entitlements.dto';

/**
 * SuperAdmin entitlement + quota administration for ONE organization (#70).
 *
 * The service layer already took an org id everywhere — `getMatrix(orgId)`,
 * `setCell(..., orgId)`, `setLimit(orgId, ...)`. What did not exist was a surface a
 * SuperAdmin could reach it through: `/module-access` is `@Roles(ADMIN)` and reads
 * `actor.organizationId`, which for a SuperAdmin is null, so it can only ever edit
 * the platform layer. This adds the org-NAMED twin rather than widening that route,
 * exactly as `PlatformUsersController` is the twin of `/users`.
 *
 * `@Platform()` at class level: fresh-DB SUPERADMIN plus a no-org check. Naming an
 * org in the PATH is only safe because of that gate — this is one of the few places
 * in the app where a client-supplied org id is honoured at all, and it is why every
 * tenant route must keep refusing one.
 *
 * Each route resolves the org FIRST, so an unknown id is a 404 rather than a write
 * into a tenant that does not exist (`setLimit` would otherwise happily INSERT a
 * quota row against a dangling org id).
 */
@ApiTags('platform')
@Platform()
@Controller('platform/organizations')
export class PlatformEntitlementsController {
  constructor(
    private readonly access: ModuleAccessService,
    private readonly quotas: QuotaService,
    private readonly orgs: OrganizationsService,
  ) {}

  /**
   * The org's Module × Role AND Feature × Role matrix in one payload.
   *
   * `getMatrix` already emits both — `MatrixCell.moduleKey` carries plain module keys
   * and dotted feature keys alike — so the client splits them using the `toggleable`
   * and `features` key lists rather than by string-parsing for a dot.
   *
   * `locked` means a ROLE CEILING or org-admin immunity owns the cell, so no override
   * at this layer can move it. The console must render those disabled with the
   * reason; offering a toggle that the resolver will ignore is worse than showing
   * none.
   */
  @Get(':id/module-access')
  async matrix(@Param('id', ParseUUIDPipe) id: string): Promise<OrgMatrixResponseDto> {
    await this.orgs.getById(id);
    return this.envelope(id);
  }

  /** Toggle one cell in THIS org's layer. Returns the refreshed matrix. */
  @Patch(':id/module-access')
  @HttpCode(200)
  async updateCell(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrgMatrixCellDto,
  ): Promise<OrgMatrixResponseDto> {
    await this.orgs.getById(id);
    // setCell itself rejects an unknown key, role=admin and any cell the ceiling
    // forbids, so those become 400s here rather than rows that never take effect.
    await this.access.setCell(dto.key, dto.role, dto.enabled, id);
    return this.envelope(id);
  }

  /**
   * Save many cells in THIS org's layer atomically. Returns the refreshed matrix.
   *
   * The org-admin console got this first; the platform console edits the same layer
   * through the same `setCells`, so it gets the same one-transaction,
   * one-invalidation guarantee rather than a second per-cell code path that races
   * differently.
   */
  @Patch(':id/module-access/bulk')
  @HttpCode(200)
  async updateCells(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrgMatrixBulkDto,
  ): Promise<OrgMatrixResponseDto> {
    await this.orgs.getById(id);
    await this.access.setCells(
      dto.cells.map((c) => ({ moduleKey: c.key, role: c.role, enabled: c.enabled })),
      id,
    );
    return this.envelope(id);
  }

  /** Live usage against the limit for every quota resource. */
  @Get(':id/quotas')
  async quotaUsage(@Param('id', ParseUUIDPipe) id: string): Promise<OrgQuotaResponseDto> {
    await this.orgs.getById(id);
    return this.readQuotas(id);
  }

  /**
   * Set or clear ONE limit.
   *
   * `limitValue: null` is UNLIMITED; `0` is BLOCKED. They are not interchangeable
   * anywhere in this stack, so the DTO requires the field to be present and accepts
   * null EXPLICITLY — an omitted field is a 400 rather than a guess, because
   * guessing here silently converts an uncapped org into a fully blocked one or the
   * reverse.
   */
  @Patch(':id/quotas')
  @HttpCode(200)
  async setQuota(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetOrgQuotaDto,
  ): Promise<OrgQuotaResponseDto> {
    await this.orgs.getById(id);
    await this.quotas.setLimit(id, dto.resource, dto.limitValue);
    return this.readQuotas(id);
  }

  /**
   * Mapped through `QuotaUsageDto.of`, NOT returned raw.
   *
   * `getUsageSummary` gives `{used, limit}`; `remaining` and `exceeded` are DERIVED,
   * and the null-vs-0 arithmetic that derives them (`limit === null ? null : max(0,
   * limit - used)`) must exist in exactly one place. Returning the raw summary would
   * push that arithmetic into the client, which is the specific mistake #70 warns
   * about — a client that re-derives it turns every uncapped org into a blocked one.
   * This is also the same shape the org detail page already renders.
   */
  private async readQuotas(orgId: string): Promise<OrgQuotaResponseDto> {
    const summary = await this.quotas.getUsageSummary(orgId);
    const entries = Object.values(QuotaResource).map(
      (resource) =>
        [resource, QuotaUsageDto.of(summary[resource].used, summary[resource].limit)] as const,
    );
    return { usage: Object.fromEntries(entries) as OrgQuotaResponseDto['usage'] };
  }

  private async envelope(orgId: string): Promise<OrgMatrixResponseDto> {
    return {
      toggleable: [...TOGGLEABLE_MODULES],
      system: [...SYSTEM_MODULES],
      features: [...ALL_FEATURES],
      matrix: await this.access.getMatrix(orgId),
    };
  }
}
