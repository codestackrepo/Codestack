/**
 * E2E for the invite engine (#104): mint -> preview -> accept, the role policy,
 * the org-less holding state, and claim.
 *
 * The raw token exists ONLY in the mail, by design — no response carries it. So
 * this suite reads it back out of the real BullMQ `mail` queue, which doubles as
 * proof of the payload contract: the queued job carries `{template, params}` and
 * never a rendered `html`/`text` body.
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
  extractAuthCookies,
  getDataSource,
  resetThrottleStorage,
  TestAppContext,
} from './utils/test-app';

jest.setTimeout(120_000);

interface QueuedInvite {
  to: string;
  template: string;
  params: { acceptUrl: string; orgName: string };
}

describe('invites (e2e)', () => {
  let ctx: TestAppContext;
  let http: import('http').Server;
  let ds: DataSource;
  let orgId: string;
  let adminCookie: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    http = ctx.app.getHttpServer();
    ds = getDataSource(ctx);
    orgId = await createTestOrg(ds);

    await request(http).post('/api/v1/auth/register').send({
      email: 'inv-admin@codestack.dev',
      password: 'Password1',
      firstName: 'Org',
      lastName: 'Admin',
    });
    adminCookie = await promote('inv-admin@codestack.dev', Role.ADMIN, orgId);
  });

  afterAll(async () => {
    await destroyTestApp(ctx);
  });

  const promote = async (email: string, role: Role, org: string | null): Promise<string> => {
    const repo = ctx.app.get<Repository<User>>(getRepositoryToken(User));
    await repo.update({ email }, { organizationId: org, role });
    resetThrottleStorage(ctx);
    const login = await request(http)
      .post('/api/v1/auth/login')
      .send({ email, password: 'Password1' });
    return extractAuthCookies(login.headers['set-cookie'] as unknown as string[]);
  };

  /** Pops the most recent queued mail and returns its payload. */
  const lastQueuedMail = async (): Promise<QueuedInvite> => {
    const queue = ctx.app.get<Queue>(getQueueToken('mail'));
    const jobs = await queue.getJobs(['waiting', 'delayed', 'active', 'completed', 'failed']);
    jobs.sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
    return jobs[0].data as QueuedInvite;
  };

  const tokenFromMail = (mail: QueuedInvite): string => mail.params.acceptUrl.split('/invite/')[1];

  describe('mint', () => {
    it('an ADMIN mints a student invite and the response carries NO token', async () => {
      const res = await request(http)
        .post('/api/v1/invites')
        .set('Cookie', adminCookie)
        .send({ email: 'newstudent@codestack.dev', role: 'student' });

      expect(res.status).toBe(201);
      expect(res.body.email).toBe('newstudent@codestack.dev');
      expect(res.body.status).toBe('pending');
      // The whole point of hashed storage: no client surface ever sees the token.
      expect(res.body.token).toBeUndefined();
      expect(res.body.tokenHash).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toMatch(/[A-Za-z0-9_-]{43}/);
    });

    it('queues a mail whose payload holds the accept URL and no rendered body', async () => {
      const mail = await lastQueuedMail();
      expect(mail.to).toBe('newstudent@codestack.dev');
      expect(mail.template).toBe('student-invite');
      expect(mail.params.acceptUrl).toContain('/invite/');
      // A failed job is retained 24h; html/text would put a live token in Redis.
      expect(mail).not.toHaveProperty('html');
      expect(mail).not.toHaveProperty('text');
      expect(mail).not.toHaveProperty('subject');
    });

    it('stores a HASH, never the token that was mailed', async () => {
      const token = tokenFromMail(await lastQueuedMail());
      const [row] = (await ds.query(
        `SELECT token_hash FROM org_invites WHERE email = 'newstudent@codestack.dev'`,
      )) as { token_hash: string }[];
      expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(row.token_hash).not.toBe(token);
    });

    // The policy matrix, not the @Roles decorator, is what stops this — RolesGuard
    // is minimum-rank, so @Roles(PROFESSOR) admits an ADMIN.
    it('403 role_not_invitable when an ADMIN tries to invite a PROFESSOR', async () => {
      const res = await request(http)
        .post('/api/v1/invites')
        .set('Cookie', adminCookie)
        .send({ email: 'prof@codestack.dev', role: 'professor' });
      expect(res.status).toBe(403);
      expect(res.body.reason).toBe('role_not_invitable');
    });

    it('403 when anyone tries to invite a SUPERADMIN', async () => {
      const res = await request(http)
        .post('/api/v1/invites')
        .set('Cookie', adminCookie)
        .send({ email: 'sa@codestack.dev', role: 'superadmin' });
      expect(res.status).toBe(403);
      expect(res.body.reason).toBe('role_not_invitable');
    });

    // forbidNonWhitelisted: the org is taken from the actor, so smuggling one is a
    // 400 rather than being silently ignored.
    it('400 when the body tries to name an organization', async () => {
      const res = await request(http)
        .post('/api/v1/invites')
        .set('Cookie', adminCookie)
        .send({ email: 'x@codestack.dev', role: 'student', organizationId: orgId });
      expect(res.status).toBe(400);
    });

    it('409 invite_already_pending on a duplicate address', async () => {
      const res = await request(http)
        .post('/api/v1/invites')
        .set('Cookie', adminCookie)
        .send({ email: 'newstudent@codestack.dev', role: 'student' });
      expect(res.status).toBe(409);
      expect(res.body.reason).toBe('invite_already_pending');
    });
  });

  describe('preview + accept', () => {
    let token: string;

    beforeAll(async () => {
      resetThrottleStorage(ctx);
      await request(http)
        .post('/api/v1/invites')
        .set('Cookie', adminCookie)
        .send({ email: 'accepter@codestack.dev', role: 'student', firstName: 'Acc' });
      token = tokenFromMail(await lastQueuedMail());
    });

    it('previews unauthenticated, naming the org and the role', async () => {
      const res = await request(http).get(`/api/v1/invites/${token}/preview`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        valid: true,
        email: 'accepter@codestack.dev',
        role: 'student',
      });
      expect(res.body.organizationName).toBeTruthy();
    });

    // A 4xx would put the raw token into AllExceptionsFilter's `path` and thence
    // the application log.
    it('answers 200 valid:false for a bogus token — never a 4xx', async () => {
      const res = await request(http).get('/api/v1/invites/not-a-real-token/preview');
      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
      // and discloses nothing
      expect(res.body.email).toBeNull();
      expect(res.body.organizationName).toBeNull();
    });

    it('accepts, creates the account in the org at the invited role, and signs in', async () => {
      resetThrottleStorage(ctx);
      const res = await request(http)
        .post('/api/v1/invites/accept')
        .send({ token, password: 'Password1', lastName: 'Epter' });

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('accepter@codestack.dev');
      expect(res.body.user.organizationId).toBe(orgId);
      expect(res.body.user.role).toBe('student');
      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies.some((c) => c.startsWith('access_token='))).toBe(true);
    });

    it('the accepted invite is consumed, so the same link 409s', async () => {
      resetThrottleStorage(ctx);
      const res = await request(http)
        .post('/api/v1/invites/accept')
        .send({ token, password: 'Password1' });
      expect(res.status).toBe(409);
      expect(res.body.reason).toBe('invite_already_accepted');
    });

    it('preview of a consumed token reveals nothing', async () => {
      const res = await request(http).get(`/api/v1/invites/${token}/preview`);
      expect(res.body).toMatchObject({ valid: false, email: null, role: null });
    });
  });

  describe('org-less holding state (@AllowsUnassigned)', () => {
    let strandedCookie: string;

    beforeAll(async () => {
      resetThrottleStorage(ctx);
      const reg = await request(http).post('/api/v1/auth/register').send({
        email: 'stranded@codestack.dev',
        password: 'Password1',
        firstName: 'Stran',
        lastName: 'Ded',
      });
      // Self-registration lands org-less — the defect #101 fixed.
      expect(reg.body.user.organizationId).toBeNull();
      strandedCookie = extractAuthCookies(reg.headers['set-cookie'] as unknown as string[]);
    });

    it('403 no_organization on an ordinary tenant route', async () => {
      const res = await request(http).get('/api/v1/classrooms').set('Cookie', strandedCookie);
      expect(res.status).toBe(403);
      expect(res.body.reason).toBe('no_organization');
    });

    // Without this the frontend cannot even discover WHY the user is confined: it
    // would see a 403, bounce to /login, succeed, re-fetch verify, and loop.
    it('reaches /auth/verify, reporting a null organization', async () => {
      const res = await request(http).get('/api/v1/auth/verify').set('Cookie', strandedCookie);
      expect(res.status).toBe(200);
      expect(res.body.organization).toBeNull();
      expect(res.body.quotas).toBeNull();
    });

    it('reaches the owner-scoped /users/me and /invites/mine', async () => {
      const me = await request(http).get('/api/v1/users/me').set('Cookie', strandedCookie);
      expect(me.status).toBe(200);
      const mine = await request(http).get('/api/v1/invites/mine').set('Cookie', strandedCookie);
      expect(mine.status).toBe(200);
      expect(mine.body).toEqual([]);
    });

    it('reaches notifications (class-level, every handler is actor.id-keyed)', async () => {
      const res = await request(http)
        .get('/api/v1/notifications/unread-count')
        .set('Cookie', strandedCookie);
      expect(res.status).toBe(200);
    });

    describe('claim', () => {
      let claimToken: string;

      beforeAll(async () => {
        resetThrottleStorage(ctx);
        await request(http)
          .post('/api/v1/invites')
          .set('Cookie', adminCookie)
          .send({ email: 'stranded@codestack.dev', role: 'student' });
        claimToken = tokenFromMail(await lastQueuedMail());
      });

      it('marks an invite to an existing org-less account as a CLAIM', async () => {
        const [row] = (await ds.query(
          `SELECT kind FROM org_invites WHERE email = 'stranded@codestack.dev'`,
        )) as { kind: string }[];
        expect(row.kind).toBe('claim');
      });

      // Never move an account into an org on the strength of a link alone.
      it('the anonymous accept path refuses it with claimRequired', async () => {
        resetThrottleStorage(ctx);
        const res = await request(http)
          .post('/api/v1/invites/accept')
          .send({ token: claimToken, password: 'Password1' });
        expect(res.status).toBe(409);
        expect(res.body).toMatchObject({ reason: 'account_exists', claimRequired: true });
      });

      it('403 when someone else signed in tries to claim it', async () => {
        resetThrottleStorage(ctx);
        const res = await request(http)
          .post('/api/v1/invites/claim')
          .set('Cookie', adminCookie)
          .send({ token: claimToken });
        expect(res.status).toBe(403);
        expect(res.body.reason).toBe('invite_email_mismatch');
      });

      it('the addressee claims it and leaves the holding state', async () => {
        resetThrottleStorage(ctx);
        const res = await request(http)
          .post('/api/v1/invites/claim')
          .set('Cookie', strandedCookie)
          .send({ token: claimToken });
        expect(res.status).toBe(200);
        expect(res.body.user.organizationId).toBe(orgId);
      });

      // The JwtAuthGuard re-stamps request.user from the fresh row, so the new org
      // binds on the very next request — no re-login, no new cookie.
      it('the SAME cookie now reaches the tenant route that 403d before', async () => {
        const res = await request(http).get('/api/v1/classrooms').set('Cookie', strandedCookie);
        expect(res.status).toBe(200);
      });
    });
  });

  describe('seat accounting', () => {
    it('a pending invite holds a seat, and accepting is net-zero', async () => {
      const seats = async (): Promise<number> => {
        const [row] = (await ds.query(
          `SELECT (
             (SELECT COUNT(*) FROM users WHERE organization_id = $1 AND is_active = true)
             + (SELECT COUNT(*) FROM org_invites
                 WHERE organization_id = $1 AND status = 'pending' AND expires_at > now())
           )::int AS n`,
          [orgId],
        )) as { n: number }[];
        return row.n;
      };

      const before = await seats();
      resetThrottleStorage(ctx);
      await request(http)
        .post('/api/v1/invites')
        .set('Cookie', adminCookie)
        .send({ email: 'seat@codestack.dev', role: 'student' });
      expect(await seats()).toBe(before + 1); // reserved at mint

      const token = tokenFromMail(await lastQueuedMail());
      resetThrottleStorage(ctx);
      await request(http).post('/api/v1/invites/accept').send({ token, password: 'Password1' });
      // invite pending->accepted is -1, the new user row is +1.
      expect(await seats()).toBe(before + 1);
    });
  });
});
