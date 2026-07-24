import { AppThrottlerGuard } from './app-throttler.guard';
import { SubmissionContext } from '../../modules/submissions/enums/submission-context.enum';

/**
 * getTracker is protected and touches no injected deps, so a thin subclass that
 * widens its visibility lets us assert the bucketing contract (§9.4) directly:
 * practice and assignment submits must land in independent counters.
 */
class TestableGuard extends AppThrottlerGuard {
  public track(req: unknown): Promise<string> {
    return this.getTracker(req as never);
  }
}

describe('AppThrottlerGuard.getTracker', () => {
  const guard = new TestableGuard({} as never, {} as never, {} as never);

  it('tracks an authenticated user with no context as user:{id} (no suffix)', async () => {
    await expect(guard.track({ user: { id: 'u1' }, body: {} })).resolves.toBe('user:u1');
  });

  it('appends :practice for a practice submit', async () => {
    await expect(
      guard.track({ user: { id: 'u1' }, body: { context: SubmissionContext.PRACTICE } }),
    ).resolves.toBe('user:u1:practice');
  });

  it('appends :assignment for an explicit assignment submit', async () => {
    await expect(
      guard.track({ user: { id: 'u1' }, body: { context: SubmissionContext.ASSIGNMENT } }),
    ).resolves.toBe('user:u1:assignment');
  });

  it('gives practice and (default) assignment DISTINCT buckets for the same user', async () => {
    const practice = await guard.track({
      user: { id: 'u1' },
      body: { context: SubmissionContext.PRACTICE },
    });
    const assignment = await guard.track({ user: { id: 'u1' }, body: {} });
    expect(practice).not.toBe(assignment);
  });

  it('ignores an unknown context value (no suffix)', async () => {
    await expect(guard.track({ user: { id: 'u1' }, body: { context: 'bogus' } })).resolves.toBe(
      'user:u1',
    );
  });

  it('falls back to ip for unauthenticated requests', async () => {
    await expect(guard.track({ ip: '1.2.3.4', body: {} })).resolves.toBe('ip:1.2.3.4');
    await expect(guard.track({})).resolves.toBe('ip:unknown');
  });
});
