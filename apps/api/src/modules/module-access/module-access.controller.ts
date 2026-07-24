import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { UpdateModuleAccessDto } from './dto/update-module-access.dto';
import { SYSTEM_MODULES, TOGGLEABLE_MODULES } from './enums/app-module-key.enum';
import { ModuleAccessService } from './module-access.service';

// NOTE (§9.7): this controller is deliberately NOT @RequiresModule-gated — an
// admin must never be able to lock themselves out of the toggles' backing API.
@ApiTags('module-access')
@ApiCookieAuth('access_token')
@Controller('module-access')
export class ModuleAccessController {
  constructor(private readonly access: ModuleAccessService) {}

  /** Effective module map for the calling user's role. Any authenticated user. */
  @Get('me')
  me(@CurrentUser() actor: AuthenticatedUser) {
    return { modules: this.access.effectiveMapForRole(actor.role) };
  }

  /** Full Module × Role matrix. Admin only. */
  @Get()
  @Roles(Role.ADMIN)
  matrix() {
    return {
      toggleable: TOGGLEABLE_MODULES,
      system: SYSTEM_MODULES,
      matrix: this.access.getMatrix(),
    };
  }

  /** Toggle one cell (admin cells + SYSTEM modules rejected). Admin only. Returns the refreshed matrix. */
  @Patch()
  @Roles(Role.ADMIN)
  async update(@Body() dto: UpdateModuleAccessDto) {
    await this.access.setCell(dto.moduleKey, dto.role, dto.enabled);
    return {
      toggleable: TOGGLEABLE_MODULES,
      system: SYSTEM_MODULES,
      matrix: this.access.getMatrix(),
    };
  }
}
