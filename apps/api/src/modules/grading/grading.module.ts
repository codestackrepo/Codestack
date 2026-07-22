import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssignmentsModule } from '../assignments/assignments.module';
import { ClassroomsModule } from '../classrooms/classrooms.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubmissionsModule } from '../submissions/submissions.module';
import { AssignmentScore } from './entities/assignment-score.entity';
import { ProblemScore } from './entities/problem-score.entity';
import { GradingController } from './grading.controller';
import { GradingService } from './grading.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProblemScore, AssignmentScore]),
    AssignmentsModule,
    ClassroomsModule,
    NotificationsModule,
    SubmissionsModule,
  ],
  controllers: [GradingController],
  providers: [GradingService],
  exports: [GradingService],
})
export class GradingModule {}
