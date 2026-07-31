import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getStorageToken, ThrottlerStorageService } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import Redis from 'ioredis';
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
  /** This suite's own database on the shared server — useful in a failure message. */
  databaseName: string;
}

/**
 * Per-suite isolation on the SHARED servers (#132).
 *
 * `JEST_WORKER_ID` is the right key for both halves. Jest gives each worker a stable
 * id and runs suites on a worker SERIALLY, so two suites sharing an id never overlap
 * in time — which makes the Redis DB index safe to reuse — while two suites running
 * concurrently are always on different workers. A counter alone would not give that:
 * concurrent suites could collide, and Redis only has 16 databases to hand out.
 *
 * The Postgres database name adds a counter anyway, so a worker running several
 * suites gets a clean schema each time without dropping one that might still have a
 * connection open.
 */
const workerId = Number(process.env.JEST_WORKER_ID ?? '1');

/**
 * A database name unique to THIS suite.
 *
 * Derived from the spec's own filename, not a counter: Jest gives every suite file a
 * fresh module registry, so a module-level counter resets to 0 for each one and two
 * suites on the same worker generate the same name — which is a hard
 * `database "..." already exists` rather than anything subtle. The path is stable,
 * unique per suite by construction, and readable in a failure message.
 *
 * `expect.getState()` is available because `createTestApp` is only ever called from
 * inside a hook. The worker id and a short random tail cover the fallback.
 */
function suiteDatabaseName(): string {
  const path = (expect.getState?.() ?? {}).testPath ?? '';
  const base =
    path
      .split('/')
      .pop()
      ?.replace(/\.e2e-spec\.ts$/, '') ?? '';
  const slug = base.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
  if (slug) return `code_test_${slug}`;
  return `code_test_w${workerId}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Empties this worker's Redis database before the app boots.
 *
 * The previous suite on this worker used the SAME logical database, so its BullMQ
 * jobs and cached keys would otherwise be visible to this one — the cross-suite bleed
 * that a container-per-suite prevented for free. `lastQueuedMail`-style helpers read
 * "the most recent job", so a leftover would be picked up as this suite's.
 */
async function flushRedis(): Promise<void> {
  const client = new Redis({
    host: process.env.E2E_REDIS_HOST,
    port: Number(process.env.E2E_REDIS_PORT),
    db: workerId,
    maxRetriesPerRequest: null,
  });
  try {
    await client.flushdb();
  } finally {
    client.disconnect();
  }
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
  const host = process.env.E2E_PG_HOST;
  const port = process.env.E2E_PG_PORT;
  if (!host || !port) {
    // globalSetup did not run — almost always because a suite was invoked with a
    // different jest config. Say so, rather than failing later on a refused socket.
    throw new Error('E2E containers are not running: check jest-e2e.json globalSetup');
  }

  const databaseName = suiteDatabaseName();

  // One admin connection to the server's default database, purely to create this
  // suite's own. Closed immediately — it is not the app's connection.
  const admin = new DataSource({
    type: 'postgres',
    host,
    port: Number(port),
    username: 'test',
    password: 'test',
    database: 'code_test',
  });
  await admin.initialize();
  // DROP first so a re-run in the same server (watch mode, or a retried suite) starts
  // from a clean schema rather than failing on "already exists".
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  await admin.destroy();

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_HOST = host;
  process.env.DATABASE_PORT = port;
  process.env.DATABASE_USER = 'test';
  process.env.DATABASE_PASSWORD = 'test';
  process.env.DATABASE_NAME = databaseName;
  process.env.DATABASE_SSL = 'false';
  process.env.REDIS_HOST = process.env.E2E_REDIS_HOST as string;
  process.env.REDIS_PORT = process.env.E2E_REDIS_PORT as string;
  process.env.REDIS_PASSWORD = '';
  // One Redis logical database per worker. Redis ships 16; Jest is capped at 4
  // workers in jest-e2e.json, so this never wraps.
  process.env.REDIS_DB = String(workerId);
  process.env.JWT_ACCESS_SECRET = 'e2e-test-access-secret-not-for-production-use';
  process.env.JWT_REFRESH_SECRET = 'e2e-test-refresh-secret-not-for-production-use';
  process.env.CORS_ORIGINS = 'http://localhost:5173';
  process.env.PISTON_URLS = 'http://127.0.0.1:1/api/v2/execute'; // unreachable on purpose — must never be hit

  // Apply the real schema via the real migrations (statically imported, so
  // ts-jest handles them like any other TS module — no dynamic glob loading).
  const migrationDataSource = new DataSource({
    type: 'postgres',
    host,
    port: Number(port),
    username: 'test',
    password: 'test',
    database: databaseName,
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

  await flushRedis();

  const fakeExecutor = new FakeExecutorService();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ExecutorService)
    .useValue(fakeExecutor)
    .compile();

  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  await app.init();

  return { app, fakeExecutor, databaseName };
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

/**
 * Closes the app only. The containers are shared and belong to globalTeardown — a
 * suite stopping them would pull the server out from under every suite still to run.
 * The database itself is left behind on purpose: it is a few KB, the server is
 * discarded at the end of the run, and dropping it here would race any connection
 * Nest has not finished closing.
 */
export async function destroyTestApp(ctx: TestAppContext): Promise<void> {
  await ctx.app.close();
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
