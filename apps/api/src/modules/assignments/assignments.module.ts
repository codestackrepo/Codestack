import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Batch } from '../classrooms/entities/batch.entity';
import { ClassroomsModule } from '../classrooms/classrooms.module';
import { LibraryProblemTemplate } from '../problems/entities/library-problem-template.entity';
import { Problem } from '../problems/entities/problem.entity';
import { TestCase } from '../problems/entities/test-case.entity';
import { AssignmentItemsController } from './assignment-items.controller';
import { AssignmentItemsService } from './assignment-items.service';
import { AssignmentTakingService } from './assignment-taking.service';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';
import { AssignmentAttempt } from './entities/assignment-attempt.entity';
import { AssignmentItem } from './entities/assignment-item.entity';
import { AssignmentProblem } from './entities/assignment-problem.entity';
import { Assignment } from './entities/assignment.entity';
import { McqOption } from './entities/mcq-option.entity';
import { McqResponse } from './entities/mcq-response.entity';
import { ProblemTemplate } from './entities/problem-template.entity';
import { QuizResponse } from './entities/quiz-response.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Assignment,
      AssignmentProblem,
      ProblemTemplate,
      Problem,
      TestCase,
      LibraryProblemTemplate,
      Batch,
      AssignmentItem,
      McqOption,
      McqResponse,
      QuizResponse,
      AssignmentAttempt,
    ]),
    ClassroomsModule,
  ],
  // AssignmentItemsController is registered FIRST so its static
  // `assignments/items/:itemId` routes are matched ahead of
  // AssignmentsController's `:id` routes.
  controllers: [AssignmentItemsController, AssignmentsController],
  providers: [AssignmentsService, AssignmentItemsService, AssignmentTakingService],
  exports: [AssignmentsService, AssignmentItemsService, TypeOrmModule],
})
export class AssignmentsModule {}
