import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getStorageToken, ThrottlerStorageService } from '@nestjs/throttler';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import cookieParser from 'cookie-parser';
import { DataSource } from 'typeorm';

import { AppModule } from '../../src/app.module';
import { ExecutorService } from '../../src/modules/code-execution/executors/executor.service';
import { FakeExecutorService } from './fake-executor.service';
import { LLM_PROVIDER } from '../../src/modules/ai/llm/llm-provider.interface';
import { FakeLlmProvider } from '../../src/modules/ai/llm/providers/fake-llm.provider';
import { PAYMENT_PROVIDER } from '../../src/modules/billing/payment/payment-provider.interface';
import { FakeStripeProvider } from '../../src/modules/billing/payment/providers/fake-stripe.provider';

import { InitUsers1784388727774 } from '../../src/database/migrations/1784388727774-InitUsers';
import { InitProblems1784388980702 } from '../../src/database/migrations/1784388980702-InitProblems';
import { InitClassrooms1784389334962 } from '../../src/database/migrations/1784389334962-InitClassrooms';
import { InitAssignments1784389613287 } from '../../src/database/migrations/1784389613287-InitAssignments';
import { InitSubmissions1784390487648 } from '../../src/database/migrations/1784390487648-InitSubmissions';
import { InitGrading1784390834115 } from '../../src/database/migrations/1784390834115-InitGrading';
import { InitDemo1784390961571 } from '../../src/database/migrations/1784390961571-InitDemo';
import { DropRedundantIndexes1784404788981 } from '../../src/database/migrations/1784404788981-DropRedundantIndexes';
import { AddAiGenerationTables1784409505122 } from '../../src/database/migrations/1784409505122-AddAiGenerationTables';
import { AddBillingTables1784431044465 } from '../../src/database/migrations/1784431044465-AddBillingTables';

const ALL_MIGRATIONS = [
  InitUsers1784388727774,
  InitProblems1784388980702,
  InitClassrooms1784389334962,
  InitAssignments1784389613287,
  InitSubmissions1784390487648,
  InitGrading1784390834115,
  InitDemo1784390961571,
  DropRedundantIndexes1784404788981,
  AddAiGenerationTables1784409505122,
  AddBillingTables1784431044465,
];

export interface TestAppContext {
  app: INestApplication;
  fakeExecutor: FakeExecutorService;
  fakeLlm: FakeLlmProvider;
  fakeStripe: FakeStripeProvider;
  pgContainer: StartedPostgreSqlContainer;
  redisContainer: StartedRedisContainer;
}

/**
 * Boots ephemeral Postgres + Redis containers, applies every real migration,
 * and starts the full Nest application with only genuine third-party
 * boundaries faked — Piston (ExecutorService), the LLM (LLM_PROVIDER), and
 * Stripe (PAYMENT_PROVIDER, whose real client throws synchronously without a
 * valid-looking secret key). Everything else — the judge queue, worker,
 * verdict logic, self-validation, webhook idempotency/dispatch, DB writes,
 * and scoring events — runs for real.
 */
export async function createTestApp(): Promise<TestAppContext> {
  const pgContainer = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('code_test')
    .withUsername('test')
    .withPassword('test')
    .start();
  const redisContainer = await new RedisContainer('redis:7-alpine').start();

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_HOST = pgContainer.getHost();
  process.env.DATABASE_PORT = String(pgContainer.getMappedPort(5432));
  process.env.DATABASE_USER = 'test';
  process.env.DATABASE_PASSWORD = 'test';
  process.env.DATABASE_NAME = 'code_test';
  process.env.DATABASE_SSL = 'false';
  process.env.REDIS_HOST = redisContainer.getHost();
  process.env.REDIS_PORT = String(redisContainer.getMappedPort(6379));
  process.env.REDIS_PASSWORD = '';
  process.env.JWT_ACCESS_SECRET = 'e2e-test-access-secret-not-for-production-use';
  process.env.JWT_REFRESH_SECRET = 'e2e-test-refresh-secret-not-for-production-use';
  process.env.CORS_ORIGINS = 'http://localhost:5173';
  process.env.PISTON_URLS = 'http://127.0.0.1:1/api/v2/execute'; // unreachable on purpose — must never be hit

  // Apply the real schema via the real migrations (statically imported, so
  // ts-jest handles them like any other TS module — no dynamic glob loading).
  const migrationDataSource = new DataSource({
    type: 'postgres',
    host: pgContainer.getHost(),
    port: pgContainer.getMappedPort(5432),
    username: 'test',
    password: 'test',
    database: 'code_test',
    migrations: ALL_MIGRATIONS,
    migrationsTableName: 'typeorm_migrations',
  });
  await migrationDataSource.initialize();
  // The migrations assume uuid_generate_v4() (from uuid-ossp) already exists
  // — normally auto-created by TypeORM when entities are registered on the
  // connection, which this migration-only DataSource deliberately has none
  // of, so it must be created explicitly first.
  await migrationDataSource.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await migrationDataSource.runMigrations();
  await migrationDataSource.destroy();

  const fakeExecutor = new FakeExecutorService();
  const fakeLlm = new FakeLlmProvider();
  const fakeStripe = new FakeStripeProvider();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ExecutorService)
    .useValue(fakeExecutor)
    .overrideProvider(LLM_PROVIDER)
    .useValue(fakeLlm)
    .overrideProvider(PAYMENT_PROVIDER)
    .useValue(fakeStripe)
    .compile();

  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  await app.init();

  return { app, fakeExecutor, fakeLlm, fakeStripe, pgContainer, redisContainer };
}

/**
 * Clears in-memory throttle state. The default ThrottlerStorage is scoped to
 * the process (no Redis-backed storage configured), so a test that
 * deliberately exhausts a rate limit would otherwise poison every later test
 * sharing the same tracker key (e.g. IP-based tracking for unauthenticated
 * login attempts) within the same app instance.
 */
export function resetThrottleStorage(ctx: TestAppContext): void {
  const storage = ctx.app.get<ThrottlerStorageService>(getStorageToken());
  storage.storage.clear();
}

export async function destroyTestApp(ctx: TestAppContext): Promise<void> {
  await ctx.app.close();
  await ctx.pgContainer.stop();
  await ctx.redisContainer.stop();
}

/** Extracts a `name=value` pair from a Set-Cookie header array for reuse in later requests. */
export function extractCookie(setCookieHeaders: string[] | undefined, name: string): string | null {
  if (!setCookieHeaders) return null;
  for (const header of setCookieHeaders) {
    const match = new RegExp(`^${name}=([^;]+)`).exec(header);
    if (match) return `${name}=${match[1]}`;
  }
  return null;
}

export function extractAuthCookies(setCookieHeaders: string[] | undefined): string {
  const access = extractCookie(setCookieHeaders, 'access_token');
  const refresh = extractCookie(setCookieHeaders, 'refresh_token');
  return [access, refresh].filter(Boolean).join('; ');
}
