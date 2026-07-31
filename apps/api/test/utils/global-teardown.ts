import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedRedisContainer } from '@testcontainers/redis';

/**
 * Stops the shared containers started by `global-setup.ts` (#132).
 *
 * Runs once, after every suite. Individual suites no longer stop anything — a suite
 * that did would pull the server out from under the ones still to run.
 */
export = async function globalTeardown(): Promise<void> {
  const handles = (globalThis as unknown as Record<string, unknown>).__E2E_CONTAINERS__ as
    { pg: StartedPostgreSqlContainer; redis: StartedRedisContainer } | undefined;
  if (!handles) return;
  // Stopped in parallel and independently: a failure stopping one must not leave the
  // other running, since testcontainers' reaper is the only thing left to catch it.
  await Promise.allSettled([handles.pg.stop(), handles.redis.stop()]);
};
