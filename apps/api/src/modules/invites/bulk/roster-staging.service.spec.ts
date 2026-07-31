import { ForbiddenException, NotFoundException } from '@nestjs/common';
import Redis from 'ioredis';
import { Role } from '../../../common/enums/role.enum';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { RosterStagingService } from './roster-staging.service';
import { RosterAction, StagedRoster } from './roster.types';

const ORG = 'org-A';
const actor = (over: Partial<AuthenticatedUser> = {}): AuthenticatedUser => ({
  id: 'admin-1',
  email: 'a@x.dev',
  role: Role.ADMIN,
  organizationId: ORG,
  ...over,
});

const staged = (over: Partial<StagedRoster> = {}): StagedRoster => ({
  organizationId: ORG,
  createdByUserId: 'admin-1',
  createdAt: new Date().toISOString(),
  rows: [
    { rowNumber: 2, email: 'a@x.dev', firstName: 'A', lastName: 'B', action: RosterAction.INVITE },
  ],
  pendingResendable: [],
  ...over,
});

function setup(stored: StagedRoster | null = staged()) {
  const redis = {
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(stored ? JSON.stringify(stored) : null),
    del: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
  };
  return { svc: new RosterStagingService(redis as unknown as Redis), redis };
}

describe('RosterStagingService', () => {
  it('stages under a namespaced key with a 30-minute TTL', async () => {
    const { svc, redis } = setup();
    const key = await svc.stage([], [], actor(), ORG);
    const [redisKey, payload, mode, ttl] = redis.set.mock.calls[0];
    expect(redisKey).toBe(`bulk-invite:staging:${key}`);
    expect(mode).toBe('EX');
    expect(ttl).toBe(1800);
    expect(JSON.parse(payload as string)).toMatchObject({
      organizationId: ORG,
      createdByUserId: 'admin-1',
    });
  });

  it('stages an unguessable key, not a predictable one', async () => {
    const { svc } = setup();
    const keys = new Set(await Promise.all([1, 2, 3].map(() => svc.stage([], [], actor(), ORG))));
    expect(keys.size).toBe(3);
    for (const k of keys) expect(k).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('404s an expired or unknown key', async () => {
    const { svc } = setup(null);
    await expect(svc.load('gone', actor(), ORG)).rejects.toBeInstanceOf(NotFoundException);
  });

  // The uuid is unguessable, but unguessable is not an authorization model: a key
  // that leaked through a log, a shared screen or browser history must not let
  // another admin commit someone else's reviewed roster.
  it('403s a different user, even with the right key', async () => {
    const { svc } = setup();
    await expect(svc.load('k', actor({ id: 'someone-else' }), ORG)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('403s the right user acting for a different organization', async () => {
    const { svc } = setup();
    await expect(svc.load('k', actor(), 'org-B')).rejects.toBeInstanceOf(ForbiddenException);
  });

  // `assertSameOrg` owns `cross_org` for row-level tenancy; reusing it here would
  // make two different failures indistinguishable in the client.
  it('reports staging_not_yours, distinct from cross_org', async () => {
    const { svc } = setup();
    try {
      await svc.load('k', actor({ id: 'other' }), ORG);
      throw new Error('expected a throw');
    } catch (err) {
      expect((err as ForbiddenException).getResponse()).toMatchObject({
        reason: 'staging_not_yours',
      });
    }
  });

  it('AUTHORIZES before deleting — a rejected load leaves the key intact', async () => {
    const { svc, redis } = setup();
    await expect(svc.load('k', actor({ id: 'other' }), ORG)).rejects.toThrow();
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('loads for the owner', async () => {
    const { svc } = setup();
    await expect(svc.load('k', actor(), ORG)).resolves.toMatchObject({ organizationId: ORG });
  });

  it('discards only when asked', async () => {
    const { svc, redis } = setup();
    await svc.discard('k');
    expect(redis.del).toHaveBeenCalledWith('bulk-invite:staging:k');
  });

  // The usual commit failure is quota_exceeded, fixed by raising the cap. Losing
  // the key would force a 2000-row re-upload and re-review to change one number.
  it('re-arms the TTL so a failed commit can be retried', async () => {
    const { svc, redis } = setup();
    await svc.extend('k');
    expect(redis.expire).toHaveBeenCalledWith('bulk-invite:staging:k', 1800);
  });
});
