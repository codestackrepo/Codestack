import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassroomsModule } from '../classrooms/classrooms.module';
import { LibraryProblemTemplate } from '../problems/entities/library-problem-template.entity';
import { Problem } from '../problems/entities/problem.entity';
import { TestCase } from '../problems/entities/test-case.entity';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';
import { AssignmentProblem } from './entities/assignment-problem.entity';
import { Assignment } from './entities/assignment.entity';
import { ProblemTemplate } from './entities/problem-template.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Assignment,
      AssignmentProblem,
      ProblemTemplate,
      Problem,
      TestCase,
      LibraryProblemTemplate,
    ]),
    ClassroomsModule,
  ],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
  exports: [AssignmentsService, TypeOrmModule],
})
export class AssignmentsModule {}
