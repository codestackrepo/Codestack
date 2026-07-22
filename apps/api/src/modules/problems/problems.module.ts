import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LibraryProblemTemplate } from './entities/library-problem-template.entity';
import { Problem } from './entities/problem.entity';
import { Tag } from './entities/tag.entity';
import { TestCase } from './entities/test-case.entity';
import { UserProblemList } from './entities/user-problem-list.entity';
import { ProblemsController } from './problems.controller';
import { ProblemsService } from './problems.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Problem, TestCase, Tag, LibraryProblemTemplate, UserProblemList]),
  ],
  controllers: [ProblemsController],
  providers: [ProblemsService],
  exports: [ProblemsService, TypeOrmModule],
})
export class ProblemsModule {}
