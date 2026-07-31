import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer } from '@testcontainers/redis';

/**
 * Starts ONE Postgres and ONE Redis for the entire e2e run (#132).
 *
 * Previously `createTestApp()` started a fresh pair PER SUITE — 22 container
 * start/stop cycles across 11 suites, and Jest runs suites in PARALLEL by default
 * (`test:e2e` passes no `--runInBand`), so several starts raced each other. The
 * result was a suite failing roughly one run in three, a different one each time,
 * with every suite passing in isolation: hook timeouts, half-open sockets, requests
 * returning error bodies where a list was expected. Two real bugs hid behind that
 * noise for several merges because "it's just flaky" is what a flaky suite teaches.
 *
 * Two containers instead of 22, started once. Isolation moves up a level: each suite
 * gets its own DATABASE on the shared server and its own Redis DB index, which
 * `createTestApp` allocates — see the note there on why the worker id is the right
 * key for both.
 *
 * The handles are stashed on `globalThis` because Jest's teardown module is a
 * separate import and has no other way to reach them.
 */
export = async function globalSetup(): Promise<void> {
  const pg = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('code_test')
    .withUsername('test')
    .withPassword('test')
    .start();
  const redis = await new RedisContainer('redis:7-alpine').start();

  // Workers are forked AFTER globalSetup, so they inherit these.
  process.env.E2E_PG_HOST = pg.getHost();
  process.env.E2E_PG_PORT = String(pg.getMappedPort(5432));
  process.env.E2E_REDIS_HOST = redis.getHost();
  process.env.E2E_REDIS_PORT = String(redis.getMappedPort(6379));

  (globalThis as unknown as Record<string, unknown>).__E2E_CONTAINERS__ = { pg, redis };
};
