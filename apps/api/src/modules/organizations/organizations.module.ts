import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailModule } from '../mail/mail.module';
import { QuotasModule } from '../quotas/quotas.module';
import { CommunityOrgService } from './community-org.service';
import { Organization } from './entities/organization.entity';
import { OrganizationApplication } from './entities/organization-application.entity';
import { OrganizationApplicationsController } from './organization-applications.controller';
import { OrganizationApplicationsService } from './organization-applications.service';
import { OrganizationCache } from './organization-cache.service';
import { OrganizationsService } from './organizations.service';

/**
 * Tenant backbone. Exports OrganizationsService + OrganizationCache (+ the
 * TypeORM repo) so the tenant-context guard (#51 wires it), SuperAdmin console
 * (#62), and quota subsystem (#66) can consume the org root without
 * re-registering the entity.
 *
 * CommunityOrgService is exported for the open-platform paths (#118) — self-signup
 * and professor applications both place their members in that tenant.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Organization, OrganizationApplication]),
    // Organization self-signup (#118) writes seat caps at approval and mails the
    // applicant plus every superadmin. NOT InvitesModule — that already imports this
    // module, so the admin invite is orchestrated from the platform controller instead.
    QuotasModule,
    MailModule,
  ],
  controllers: [OrganizationApplicationsController],
  providers: [
    OrganizationsService,
    OrganizationCache,
    CommunityOrgService,
    OrganizationApplicationsService,
  ],
  exports: [
    OrganizationsService,
    OrganizationCache,
    CommunityOrgService,
    OrganizationApplicationsService,
    TypeOrmModule,
  ],
})
export class OrganizationsModule {}
