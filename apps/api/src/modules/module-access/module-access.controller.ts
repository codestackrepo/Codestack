import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { UpdateModuleAccessBulkDto } from './dto/update-module-access-bulk.dto';
import { UpdateModuleAccessDto } from './dto/update-module-access.dto';
import { SYSTEM_MODULES, TOGGLEABLE_MODULES } from './enums/app-module-key.enum';
import { ALL_FEATURES } from './enums/feature-key.enum';
import { MatrixCell, ModuleAccessService } from './module-access.service';

// NOTE (§9.7): this controller is deliberately NOT @RequiresModule/@RequiresFeature
// gated — an admin must never be able to lock themselves out of the toggles' own API.
//
// TENANCY (#64): the layer read/written is always `actor.organizationId`, never a
// value from the request. An org admin therefore edits its OWN org layer (§5.5
// layer 5), while a SuperAdmin — org null, and it outranks @Roles(ADMIN) by rank —
// edits the PLATFORM layer (layer 6). That falls out of the actor's org with no
// branch. Editing ANOTHER org's layer is a platform-console concern and belongs on
// an explicit `:orgId` route, never on this one.
@ApiTags('module-access')
@ApiCookieAuth('access_token')
@Controller('module-access')
export class ModuleAccessController {
  constructor(private readonly access: ModuleAccessService) {}

  /** Effective module + feature maps for the calling user. Any authenticated user. */
  @Get('me')
  async me(@CurrentUser() actor: AuthenticatedUser) {
    const [modules, features] = await Promise.all([
      this.access.effectiveMapForRole(actor.role, actor.organizationId),
      this.access.effectiveFeatureMap(actor.role, actor.organizationId),
    ]);
    return { modules, features };
  }

  /** Module × Role and Feature × Role matrix for the actor's layer. Admin+. */
  @Get()
  @Roles(Role.ADMIN)
  async matrix(@CurrentUser() actor: AuthenticatedUser) {
    return this.envelope(
      await this.access.getMatrix(actor.organizationId),
      await this.access.cappedKeys(actor.organizationId),
    );
  }

  /** Toggle one cell in the actor's layer. Admin+. Returns the refreshed matrix. */
  @Patch()
  @Roles(Role.ADMIN)
  async update(@Body() dto: UpdateModuleAccessDto, @CurrentUser() actor: AuthenticatedUser) {
    await this.access.setCell(dto.moduleKey, dto.role, dto.enabled, actor.organizationId);
    return this.envelope(
      await this.access.getMatrix(actor.organizationId),
      await this.access.cappedKeys(actor.organizationId),
    );
  }

  /**
   * Save many cells at once, atomically. Admin+. Returns the refreshed matrix.
   *
   * This is what the admin matrix's Save button calls. The single-cell PATCH above
   * is kept for one-off flips and for any client already using it.
   */
  @Patch('bulk')
  @Roles(Role.ADMIN)
  async updateBulk(
    @Body() dto: UpdateModuleAccessBulkDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    await this.access.setCells(dto.cells, actor.organizationId);
    return this.envelope(
      await this.access.getMatrix(actor.organizationId),
      await this.access.cappedKeys(actor.organizationId),
    );
  }

  private envelope(matrix: MatrixCell[], capped: string[] = []) {
    return {
      /** Keys a platform grant has switched off — locked for this org (#71). */
      capped,
      toggleable: TOGGLEABLE_MODULES,
      system: SYSTEM_MODULES,
      features: ALL_FEATURES,
      matrix,
    };
  }
}
