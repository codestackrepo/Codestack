import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from './entities/company.entity';
import { LibraryProblemTemplate } from './entities/library-problem-template.entity';
import { Problem } from './entities/problem.entity';
import { Tag } from './entities/tag.entity';
import { TestCase } from './entities/test-case.entity';
import { UserProblemList } from './entities/user-problem-list.entity';
import { QuotasModule } from '../quotas/quotas.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { User } from '../users/entities/user.entity';
import { ProblemFeedback } from './feedback/entities/problem-feedback.entity';
import {
  FeedbackInboxController,
  ProblemFeedbackController,
} from './feedback/problem-feedback.controller';
import { ProblemFeedbackService } from './feedback/problem-feedback.service';
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
      // #75. `User` is registered here (not imported from UsersModule) because the
      // feedback fan-out only needs a read of `{id, role}` for the org's staff —
      // pulling in UsersModule would make ProblemsModule depend on the whole user
      // write surface for one SELECT.
      ProblemFeedback,
      User,
    ]),
    QuotasModule,
    NotificationsModule, // #75 doubts fan out to the author's own org staff
  ],
  controllers: [ProblemsController, ProblemFeedbackController, FeedbackInboxController],
  providers: [ProblemsService, ProblemFeedbackService],
  exports: [ProblemsService, TypeOrmModule],
})
export class ProblemsModule {}
