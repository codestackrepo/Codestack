import { Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from './config/config.module';
import { ThrottleConfig } from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { QueueModule } from './queue/queue.module';
import { HealthModule } from './health/health.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { ProblemsModule } from './modules/problems/problems.module';
import { ClassroomsModule } from './modules/classrooms/classrooms.module';
import { AssignmentsModule } from './modules/assignments/assignments.module';
import { SubmissionsModule } from './modules/submissions/submissions.module';
import { CodeExecutionModule } from './modules/code-execution/code-execution.module';
import { GradingModule } from './modules/grading/grading.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PlaygroundModule } from './modules/playground/playground.module';
import { DemoModule } from './modules/demo/demo.module';
import { AiModule } from './modules/ai/ai.module';
import { BillingModule } from './modules/billing/billing.module';

@Module({
  imports: [
    AppConfigModule,
    EventEmitterModule.forRoot(),
    // Named throttlers overridden per-route via @Throttle(); this registration
    // also supplies the baseline "day" cap that applies where no @Throttle
    // override is present. Tracked per-user when authenticated, else per-IP
    // (see AppThrottlerGuard).
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const t = config.getOrThrow<ThrottleConfig>('throttle');
        return {
          throttlers: [
            { name: 'minute', ttl: 60_000, limit: 60 },
            // Generous baseline — only the AI generation endpoint tightens
            // this via a per-route @Throttle() override (AI_RATE_LIMIT_PER_HOUR).
            { name: 'hour', ttl: 3_600_000, limit: 1000 },
            { name: 'day', ttl: 86_400_000, limit: t.globalPerDay },
          ],
        };
      },
    }),
    DatabaseModule,
    RedisModule,
    QueueModule,
    HealthModule,
    UsersModule,
    AuthModule,
    ProblemsModule,
    ClassroomsModule,
    AssignmentsModule,
    SubmissionsModule,
    CodeExecutionModule,
    GradingModule,
    NotificationsModule,
    PlaygroundModule,
    DemoModule,
    BillingModule,
    AiModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    },
  ],
})
export class AppModule {}
