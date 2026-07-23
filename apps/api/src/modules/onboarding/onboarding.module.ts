import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { ProfessorInvite } from './entities/professor-invite.entity';
import { ProfessorRequest } from './entities/professor-request.entity';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProfessorInvite, ProfessorRequest]),
    UsersModule,
    NotificationsModule,
  ],
  controllers: [OnboardingController],
  providers: [OnboardingService],
  // Exported so AuthModule can consume the invite validate/consume methods in
  // its registration hook.
  exports: [OnboardingService],
})
export class OnboardingModule {}
