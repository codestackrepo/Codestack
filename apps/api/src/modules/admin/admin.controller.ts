import { Controller, Get } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AdminOverview, AdminService } from './admin.service';

// Admin-only (§2 decision 8). Deliberately NOT @RequiresModule-gated (§9.7): an
// admin must never be able to lock themselves out of the admin panel.
@ApiTags('admin')
@ApiCookieAuth('access_token')
@Controller('admin')
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('overview')
  overview(@CurrentUser() actor: AuthenticatedUser): Promise<AdminOverview> {
    return this.admin.overview(actor);
  }
}
