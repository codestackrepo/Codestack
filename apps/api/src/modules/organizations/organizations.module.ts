import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from './entities/organization.entity';
import { OrganizationsService } from './organizations.service';

/**
 * Tenant backbone. Exports OrganizationsService (+ the TypeORM repo) so the
 * tenant-context guard (#49), SuperAdmin console (#62), and quota subsystem
 * (#66) can consume the org root without re-registering the entity.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Organization])],
  providers: [OrganizationsService],
  exports: [OrganizationsService, TypeOrmModule],
})
export class OrganizationsModule {}
