import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Assignment } from '../assignments/entities/assignment.entity';
import { AuthModule } from '../auth/auth.module';
import { Classroom } from '../classrooms/entities/classroom.entity';
import { OrgInvite } from '../clerk-sync/entities/org-invite.entity';
import { OrganizationsModule } from '../organizations/organizations.module';
import { Problem } from '../problems/entities/problem.entity';
import { Submission } from '../submissions/entities/submission.entity';
import { User } from '../users/entities/user.entity';
import { UsersModule } from '../users/users.module';
import { PlatformMetricsService } from './platform-metrics.service';
import { PlatformOverviewController } from './platform-overview.controller';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { PlatformGuard } from './guards/platform.guard';

/**
 * SuperAdmin platform console (#62, #63). Consumes OrganizationsService +
 * OrganizationCache (tenant root), UsersService (fresh-DB platform authority
 * check + acting admin's clerk id), and ClerkService (exported by AuthModule) to
 * mirror orgs into Clerk.
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
    AuthModule,
  ],
  controllers: [PlatformController, PlatformOverviewController],
  providers: [PlatformService, PlatformMetricsService, PlatformGuard],
  exports: [PlatformService],
})
export class PlatformModule {}
