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

import { ALL_MIGRATIONS } from './all-migrations';

// Re-exported so a suite (and the drift guard's own consumers) can reach the list
// through the harness it belongs to. The array itself lives in its own module
// because the unit-jest environment cannot load this file's testcontainers imports.
export { ALL_MIGRATIONS };

export interface TestAppContext {
  app: INestApplication;
  fakeExecutor: FakeExecutorService;
  pgContainer: StartedPostgreSqlContainer;
  redisContainer: StartedRedisContainer;
}

/**
 * Boots ephemeral Postgres + Redis containers, applies every real migration,
 * and starts the full Nest application with only the genuine third-party
 * boundary faked — Piston (ExecutorService). (The AI/LLM and Stripe/billing
 * modules were disabled at M0 and are no longer in the AppModule graph, so
 * there is nothing to override for them.) Everything else — the judge queue,
 * worker, verdict logic, DB writes, and scoring events — runs for real.
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

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ExecutorService)
    .useValue(fakeExecutor)
    .compile();

  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  await app.init();

  return { app, fakeExecutor, pgContainer, redisContainer };
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

let orgSeq = 0;

/**
 * Inserts a real `organizations` row and returns its id.
 *
 * Fixtures need a tenant for two independent reasons, and BOTH bite before a
 * single assertion runs:
 *
 *  - `chk_users_org_required` exempts only SUPERADMIN and (since
 *    1785520000000) STUDENT, so `userRepo.update({ role: PROFESSOR })` on an
 *    org-less self-registrant raises 23514.
 *  - `TenantContextGuard` is live at APP_GUARD slot 2, so an org-less
 *    non-superadmin — student included — 403s `no_organization` on every route
 *    that isn't `@Public`.
 *
 * So a suite must stamp `organization_id` on every fixture user it drives
 * through the API, not just the ones it promotes. `OrganizationCache` warms once
 * at bootstrap and treats an unknown org as NOT suspended, so a row created after
 * boot passes the guard with no cache reload.
 */
export async function createTestOrg(dataSource: DataSource): Promise<string> {
  const n = ++orgSeq;
  const rows = await dataSource.query<{ id: string }[]>(
    `INSERT INTO "organizations" ("name","slug","type","status")
       VALUES ($1,$2,'university','active') RETURNING "id"`,
    [`E2E Org ${n}`, `e2e-org-${n}`],
  );
  return rows[0].id;
}

/** The app's live DataSource — for fixture SQL and repository shortcuts. */
export function getDataSource(ctx: TestAppContext): DataSource {
  return ctx.app.get(DataSource);
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
