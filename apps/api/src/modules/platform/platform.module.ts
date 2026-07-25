import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { UsersModule } from '../users/users.module';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { PlatformGuard } from './guards/platform.guard';

/**
 * SuperAdmin platform console (#62). Consumes OrganizationsService +
 * OrganizationCache (tenant root), UsersService (fresh-DB platform authority
 * check + acting admin's clerk id), and ClerkService (exported by AuthModule) to
 * mirror orgs into Clerk.
 */
@Module({
  imports: [OrganizationsModule, UsersModule, AuthModule],
  controllers: [PlatformController],
  providers: [PlatformService, PlatformGuard],
  exports: [PlatformService],
})
export class PlatformModule {}
