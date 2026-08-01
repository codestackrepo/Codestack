import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { ProfessorApplication } from './entities/professor-application.entity';
import { ProfessorRequest } from './entities/professor-request.entity';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { ProfessorApplicationsController } from './professor-applications.controller';
import { ProfessorApplicationsService } from './professor-applications.service';

/**
 * Two DIFFERENT professor pathways live here, and both are load-bearing (#118):
 *
 *   ProfessorRequest      an existing member of a tenant asks to be promoted inside it,
 *                         reviewed by that org's admin. Still needed even though admins
 *                         can now invite professors directly, because an invite to an
 *                         address that is already a member of the org answers
 *                         `already_member` and changes no role.
 *   ProfessorApplication  a stranger asks to teach on the OPEN platform, reviewed by the
 *                         platform superadmin. Approval mints an invite into the
 *                         community tenant.
 *
 * NOT InvitesModule — it imports this side of the graph. The approval that mints the
 * invite is orchestrated from the platform controller, which can reach both.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ProfessorRequest, ProfessorApplication]),
    UsersModule,
    NotificationsModule,
    MailModule,
  ],
  controllers: [OnboardingController, ProfessorApplicationsController],
  providers: [OnboardingService, ProfessorApplicationsService],
  // Exported so AuthModule can consume the invite validate/consume methods in
  // its registration hook, and so the platform console can review applications.
  exports: [OnboardingService, ProfessorApplicationsService],
})
export class OnboardingModule {}
