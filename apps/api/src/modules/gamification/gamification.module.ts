import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Problem } from '../problems/entities/problem.entity';
import { Submission } from '../submissions/entities/submission.entity';
import { User } from '../users/entities/user.entity';
import { DailyActivity } from './entities/daily-activity.entity';
import { PointsLedger } from './entities/points-ledger.entity';
import { UserGamification } from './entities/user-gamification.entity';
import { UserSolvedProblem } from './entities/user-solved-problem.entity';
import { GamificationController } from './gamification.controller';
import { GamificationListener } from './gamification.listener';
import { GamificationService } from './gamification.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserGamification,
      UserSolvedProblem,
      PointsLedger,
      DailyActivity,
      Submission,
      Problem,
      User,
    ]),
  ],
  controllers: [GamificationController],
  providers: [GamificationService, GamificationListener],
  exports: [GamificationService],
})
export class GamificationModule {}
