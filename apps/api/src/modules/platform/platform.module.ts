import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Assignment } from '../assignments/entities/assignment.entity';
import { Classroom } from '../classrooms/entities/classroom.entity';
import { OrgInvite } from '../invites/entities/org-invite.entity';
import { InvitesModule } from '../invites/invites.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { Problem } from '../problems/entities/problem.entity';
import { Submission } from '../submissions/entities/submission.entity';
import { User } from '../users/entities/user.entity';
import { QuotasModule } from '../quotas/quotas.module';
import { UsersModule } from '../users/users.module';
import { PlatformMetricsService } from './platform-metrics.service';
import { PlatformOverviewController } from './platform-overview.controller';
import { ModuleAccessModule } from '../module-access/module-access.module';
import { PlatformController } from './platform.controller';
import { PlatformEntitlementsController } from './platform-entitlements.controller';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { PlatformOrgApplicationsController } from './platform-org-applications.controller';
import { PlatformProfessorApplicationsController } from './platform-professor-applications.controller';
import { PlatformUsersController } from './platform-users.controller';
import { PlatformService } from './platform.service';
import { PlatformGuard } from './guards/platform.guard';

/**
 * SuperAdmin platform console (#62, #63). Consumes OrganizationsService +
 * OrganizationCache (tenant root) and UsersService (PlatformGuard's fresh-DB
 * authority re-check). AuthModule is NOT imported — nothing here needs it.
 *
 * The cross-org census (#63) registers the counted entities directly instead of
 * importing their feature modules: it only ever reads aggregates, and routing
 * through those services would both re-apply org scoping (the opposite of what a
 * platform read wants) and pull in a web of circular module imports. TypeORM
 * allows the same entity in multiple forFeature scopes.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([User, Classroom, Problem, Assignment, Submission, OrgInvite]),
    OrganizationsModule,
    UsersModule,
    QuotasModule,
    // #70: the SuperAdmin org-scoped entitlement console reads/writes the matrix.
    ModuleAccessModule,
    // #118: approving an organization application mints the org-admin invite through
    // the ordinary machinery. Safe to import here — InvitesModule imports
    // OrganizationsModule and UsersModule, but never PlatformModule, so there is no
    // cycle. Orchestrating it here is what lets OrganizationsModule stay free of an
    // InvitesModule dependency it could not have.
    InvitesModule,
    // #118: open-professor applications are reviewed here too, and approval mints a
    // community-tenant invite. Same no-cycle reasoning as InvitesModule above.
    OnboardingModule,
  ],
  controllers: [
    PlatformController,
    PlatformOverviewController,
    PlatformUsersController,
    PlatformEntitlementsController,
    PlatformOrgApplicationsController,
    PlatformProfessorApplicationsController,
  ],
  providers: [PlatformService, PlatformMetricsService, PlatformGuard],
  exports: [PlatformService],
})
export class PlatformModule {}
