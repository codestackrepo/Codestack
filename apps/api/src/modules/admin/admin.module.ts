import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Assignment } from '../assignments/entities/assignment.entity';
import { Classroom } from '../classrooms/entities/classroom.entity';
import { ProfessorInvite } from '../onboarding/entities/professor-invite.entity';
import { ProfessorRequest } from '../onboarding/entities/professor-request.entity';
import { Problem } from '../problems/entities/problem.entity';
import { Submission } from '../submissions/entities/submission.entity';
import { User } from '../users/entities/user.entity';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Classroom,
      Problem,
      Assignment,
      Submission,
      ProfessorRequest,
      ProfessorInvite,
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
