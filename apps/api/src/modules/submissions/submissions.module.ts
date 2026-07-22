import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssignmentProblem } from '../assignments/entities/assignment-problem.entity';
import { ClassroomsModule } from '../classrooms/classrooms.module';
import { ExecutionJob } from './entities/execution-job.entity';
import { Submission } from './entities/submission.entity';
import { TestCaseResult } from './entities/test-case-result.entity';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Submission, TestCaseResult, ExecutionJob, AssignmentProblem]),
    ClassroomsModule,
  ],
  controllers: [SubmissionsController],
  providers: [SubmissionsService],
  exports: [SubmissionsService, TypeOrmModule],
})
export class SubmissionsModule {}
