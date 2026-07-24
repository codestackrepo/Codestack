import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from './entities/organization.entity';
import { OrganizationCache } from './organization-cache.service';
import { OrganizationsService } from './organizations.service';

/**
 * Tenant backbone. Exports OrganizationsService + OrganizationCache (+ the
 * TypeORM repo) so the tenant-context guard (#51 wires it), SuperAdmin console
 * (#62), and quota subsystem (#66) can consume the org root without
 * re-registering the entity.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Organization])],
  providers: [OrganizationsService, OrganizationCache],
  exports: [OrganizationsService, OrganizationCache, TypeOrmModule],
})
export class OrganizationsModule {}
