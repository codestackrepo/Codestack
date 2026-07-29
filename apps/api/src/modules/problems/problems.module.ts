import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from './entities/company.entity';
import { LibraryProblemTemplate } from './entities/library-problem-template.entity';
import { Problem } from './entities/problem.entity';
import { Tag } from './entities/tag.entity';
import { TestCase } from './entities/test-case.entity';
import { UserProblemList } from './entities/user-problem-list.entity';
import { QuotasModule } from '../quotas/quotas.module';
import { ProblemsController } from './problems.controller';
import { ProblemsService } from './problems.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Problem,
      TestCase,
      Tag,
      Company,
      LibraryProblemTemplate,
      UserProblemList,
    ]),
    QuotasModule,
  ],
  controllers: [ProblemsController],
  providers: [ProblemsService],
  exports: [ProblemsService, TypeOrmModule],
})
export class ProblemsModule {}
