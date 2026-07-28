import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModuleAccess } from './entities/module-access.entity';
import { OrgModuleGrant } from './entities/org-module-grant.entity';
import { ModuleAccessController } from './module-access.controller';
import { ModuleAccessService } from './module-access.service';

/**
 * The module/feature permission hierarchy (#64). Owns both override layers
 * (`module_access`: platform + org) and the SuperAdmin cap (`org_module_grant`).
 * The guards that consume it (ModuleAccessGuard, FeatureGuard) are registered as
 * APP_GUARDs in AuthModule, which is where the global chain's order is declared.
 * REDIS_CLIENT comes from the @Global RedisModule, so no import is needed for it.
 */
@Module({
  imports: [TypeOrmModule.forFeature([ModuleAccess, OrgModuleGrant])],
  controllers: [ModuleAccessController],
  providers: [ModuleAccessService],
  exports: [ModuleAccessService],
})
export class ModuleAccessModule {}
