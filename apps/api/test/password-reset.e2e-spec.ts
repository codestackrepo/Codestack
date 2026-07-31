/**
 * E2E for password reset (#107).
 *
 * The raw token exists only in the mail, so this suite reads it back out of the
 * live BullMQ queue — the same technique the invite suite uses, and the same
 * proof that no response carries it.
 */
import { getQueueToken } from '@nestjs/bullmq';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import request from 'supertest';
import { DataSource, Repository } from 'typeorm';

import { Role } from '../src/common/enums/role.enum';
import { User } from '../src/modules/users/entities/user.entity';
import {
  createTestApp,
  createTestOrg,
  destroyTestApp,
  getDataSource,
  resetThrottleStorage,
  TestAppContext,
} from './utils/test-app';

jest.setTimeout(120_000);

describe('password reset (e2e)', () => {
  let ctx: TestAppContext;
  let http: import('http').Server;
  let ds: DataSource;
  let orgA: string;

  const EMAIL = 'pr-user@codestack.dev';

  const mailQueue = (): Queue => ctx.app.get<Queue>(getQueueToken('mail'));

  const forgot = async (email: string) => {
    resetThrottleStorage(ctx);
    return request(http).post('/api/v1/auth/forgot-password').send({ email });
  };

  /**
   * Requests a reset and returns the token from the mail it queued.
   *
   * The queue is emptied FIRST so exactly one job can match. Sorting a mixed
   * queue by `timestamp` is not enough: two jobs minted in the same millisecond
   * tie, the sort is unstable, and the helper intermittently returns a token that
   * the newer request has just invalidated — a flake that looks like a bug in the
   * reset flow.
   */
  const forgotAndToken = async (email: string): Promise<string> => {
    await mailQueue().obliterate({ force: true });
    await forgot(email);
    const jobs = await mailQueue().getJobs(['waiting', 'delayed', 'active', 'completed', 'failed']);
    expect(jobs).toHaveLength(1);
    const data = jobs[0].data as { params: { resetUrl: string } };
    return data.params.resetUrl.split('/reset-password/')[1];
  };

  const liveTokenCount = async (): Promise<number> => {
    const [row] = (await ds.query(
      `SELECT COUNT(*)::int AS n FROM password_reset_tokens t
         JOIN users u ON u.id = t.user_id
        WHERE u.email = $1 AND t.used_at IS NULL`,
      [EMAIL],
    )) as { n: number }[];
    return row.n;
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    http = ctx.app.getHttpServer();
    ds = getDataSource(ctx);
    orgA = await createTestOrg(ds);

    resetThrottleStorage(ctx);
    await request(http)
      .post('/api/v1/auth/register')
      .send({ email: EMAIL, password: 'Password1', firstName: 'PR', lastName: 'User' });
    const repo = ctx.app.get<Repository<User>>(getRepositoryToken(User));
    await repo.update({ email: EMAIL }, { organizationId: orgA, role: Role.STUDENT });
  });

  afterAll(async () => {
    await destroyTestApp(ctx);
  });

  describe('forgot-password is non-enumerable', () => {
    // users.email is globally unique, so ANY observable difference between these
    // is a definite "this person has an account here".
    it('answers identically for a known and an unknown address', async () => {
      const known = await forgot(EMAIL);
      const unknown = await forgot('definitely-nobody@codestack.dev');

      expect(known.status).toBe(200);
      expect(unknown.status).toBe(200);
      expect(known.body).toEqual(unknown.body);
    });

    it('answers identically for a DISABLED account', async () => {
      const repo = ctx.app.get<Repository<User>>(getRepositoryToken(User));
      await repo.update({ email: EMAIL }, { isActive: false });
      const disabled = await forgot(EMAIL);
      const unknown = await forgot('nobody-2@codestack.dev');
      expect(disabled.body).toEqual(unknown.body);
      expect(disabled.status).toBe(unknown.status);
      await repo.update({ email: EMAIL }, { isActive: true });
    });

    it('mints no row for an unknown address', async () => {
      const before = await liveTokenCount();
      await forgot('nobody-3@codestack.dev');
      expect(await liveTokenCount()).toBe(before);
    });
  });

  describe('token lifecycle', () => {
    it('mints a live token and mails a link containing it', async () => {
      const token = await forgotAndToken(EMAIL);
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

      // Stored hashed, never in the clear.
      const [row] = (await ds.query(
        `SELECT token_hash FROM password_reset_tokens ORDER BY created_at DESC LIMIT 1`,
      )) as { token_hash: string }[];
      expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(row.token_hash).not.toBe(token);
    });

    // Requesting twice must not leave two working links — the older one is likely
    // in a mail the user already decided to ignore.
    it('a second request invalidates the first link', async () => {
      const first = await forgotAndToken(EMAIL);
      const second = await forgotAndToken(EMAIL);
      expect(second).not.toBe(first);
      expect(await liveTokenCount()).toBe(1);

      const stale = await request(http).get(`/api/v1/auth/reset/${first}/preview`);
      expect(stale.body.status).toBe('used');
      const fresh = await request(http).get(`/api/v1/auth/reset/${second}/preview`);
      expect(fresh.body.status).toBe('valid');
    });
  });

  describe('preview', () => {
    // A 4xx would put the raw token into AllExceptionsFilter's `path` and thence
    // the application log.
    it('answers 200 for a bogus token, never a 4xx', async () => {
      const res = await request(http).get('/api/v1/auth/reset/not-a-real-token/preview');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('not_found');
      expect(res.body.maskedEmail).toBeUndefined();
    });

    it('returns a MASKED address for a valid token and nothing else', async () => {
      const token = await forgotAndToken(EMAIL);
      const res = await request(http).get(`/api/v1/auth/reset/${token}/preview`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('valid');
      expect(res.body.maskedEmail).toContain('@codestack.dev');
      expect(res.body.maskedEmail).not.toBe(EMAIL);
      // No role, no org, and above all no token.
      expect(Object.keys(res.body).sort()).toEqual(['maskedEmail', 'status']);
    });
  });

  describe('reset-password', () => {
    it('sets the new password, signs the user in, and consumes the token', async () => {
      const token = await forgotAndToken(EMAIL);

      resetThrottleStorage(ctx);
      const res = await request(http)
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'BrandNew1' });

      expect(res.status).toBe(200);
      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies.some((c) => c.startsWith('access_token='))).toBe(true);

      // The new password works...
      resetThrottleStorage(ctx);
      const login = await request(http)
        .post('/api/v1/auth/login')
        .send({ email: EMAIL, password: 'BrandNew1' });
      expect(login.status).toBe(200);

      // ...and the old one does not.
      resetThrottleStorage(ctx);
      const old = await request(http)
        .post('/api/v1/auth/login')
        .send({ email: EMAIL, password: 'Password1' });
      expect(old.status).toBe(401);

      expect(await liveTokenCount()).toBe(0);
    });

    // Single-use. The conditional UPDATE is what enforces it; a read-then-write
    // would let a replayed link set a password a second time.
    it('refuses to reuse a consumed link', async () => {
      const token = await forgotAndToken(EMAIL);
      resetThrottleStorage(ctx);
      await request(http)
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'Another11' });

      resetThrottleStorage(ctx);
      const replay = await request(http)
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'Hijacked1' });
      expect(replay.status).toBe(403);
      expect(replay.body.reason).toBe('reset_token_used');

      // And the replay changed nothing.
      resetThrottleStorage(ctx);
      const login = await request(http)
        .post('/api/v1/auth/login')
        .send({ email: EMAIL, password: 'Another11' });
      expect(login.status).toBe(200);
    });

    it('rejects a bogus token', async () => {
      resetThrottleStorage(ctx);
      const res = await request(http)
        .post('/api/v1/auth/reset-password')
        .send({ token: 'x'.repeat(43), password: 'Password1' });
      expect(res.status).toBe(403);
      expect(res.body.reason).toBe('reset_token_invalid');
    });

    it('enforces the same password rule as registration', async () => {
      const token = await forgotAndToken(EMAIL);
      resetThrottleStorage(ctx);
      const res = await request(http)
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'short' });
      expect(res.status).toBe(400);
    });

    it('403s a disabled account holding an otherwise valid link', async () => {
      const token = await forgotAndToken(EMAIL);
      const repo = ctx.app.get<Repository<User>>(getRepositoryToken(User));
      await repo.update({ email: EMAIL }, { isActive: false });

      resetThrottleStorage(ctx);
      const res = await request(http)
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'Password9' });
      expect(res.status).toBe(403);
      expect(res.body.reason).toBe('account_disabled');

      await repo.update({ email: EMAIL }, { isActive: true });
    });
  });

  describe('an invited account with no password yet', () => {
    // They recover by ACCEPTING the invite, not by resetting a password that does
    // not exist — and the endpoint still must not say so.
    it('is silently skipped, with the same 200', async () => {
      await ds.query(
        `INSERT INTO users (email, first_name, last_name, role, organization_id, password_hash)
         VALUES ($1,'No','Password','student',$2,NULL)`,
        ['pr-invited@codestack.dev', orgA],
      );
      const res = await forgot('pr-invited@codestack.dev');
      expect(res.status).toBe(200);

      const [row] = (await ds.query(
        `SELECT COUNT(*)::int AS n FROM password_reset_tokens t
           JOIN users u ON u.id = t.user_id WHERE u.email = $1`,
        ['pr-invited@codestack.dev'],
      )) as { n: number }[];
      expect(row.n).toBe(0);
    });
  });
});
