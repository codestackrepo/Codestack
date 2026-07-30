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
import { InvitesModule } from './modules/invites/invites.module';
import { MailModule } from './modules/mail/mail.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { ModuleAccessModule } from './modules/module-access/module-access.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { PlatformModule } from './modules/platform/platform.module';
import { QuotasModule } from './modules/quotas/quotas.module';
import { ProblemsModule } from './modules/problems/problems.module';
import { ClassroomsModule } from './modules/classrooms/classrooms.module';
import { AssignmentsModule } from './modules/assignments/assignments.module';
import { SubmissionsModule } from './modules/submissions/submissions.module';
import { CodeExecutionModule } from './modules/code-execution/code-execution.module';
import { GradingModule } from './modules/grading/grading.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PlaygroundModule } from './modules/playground/playground.module';
import { GamificationModule } from './modules/gamification/gamification.module';
import { AdminModule } from './modules/admin/admin.module';
import { DemoModule } from './modules/demo/demo.module';
// AiModule and BillingModule are intentionally NOT imported (M0 — "Disable & hide
// AI + Billing"). Their source and migrations remain on disk so the feature can be
// re-enabled later; they are simply not registered in the composition root, so
// neither the API nor the worker (which boots this same AppModule) loads them.

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
    // Transactional mail (#103). Registered before the tenant backbone because
    // the invite, access-change and password-reset flows all inject MailService.
    MailModule,
    // Tenant backbone — foundational, registered before feature modules.
    OrganizationsModule,
    UsersModule,
    AuthModule,
    PlatformModule,
    OnboardingModule,
    InvitesModule,
    ModuleAccessModule,
    QuotasModule,
    ProblemsModule,
    ClassroomsModule,
    AssignmentsModule,
    SubmissionsModule,
    CodeExecutionModule,
    GradingModule,
    NotificationsModule,
    PlaygroundModule,
    // Registered here (not only where its controller lives) so the
    // SUBMISSION_FINALIZED listener also runs in the worker process (§5.6).
    GamificationModule,
    AdminModule,
    DemoModule,
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
