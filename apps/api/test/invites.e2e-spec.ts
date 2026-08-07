/**
 * E2E for the invite engine (#104): mint -> preview -> accept, the role policy,
 * the org-less holding state, and claim.
 *
 * The raw token exists ONLY in the mail, by design — no response carries it. So
 * this suite reads it back out of the real BullMQ `mail` queue, which doubles as
 * proof of the payload contract: the queued job carries `{template, params}` and
 * never a rendered `html`/`text` body.
 */
import { createHash } from 'node:crypto';

import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { Role } from '../src/common/enums/role.enum';
import { JOB_SEND_MAIL } from '../src/queue/queue.constants';
import {
  createTestApp,
  createTestOrg,
  destroyTestApp,
  getDataSource,
  registerUser,
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

    adminCookie = (
      await registerUser(ctx, {
        email: 'inv-admin@codestack.dev',
        role: Role.ADMIN,
        organizationId: orgId,
        firstName: 'Org',
        lastName: 'Admin',
      })
    ).cookie;
  });

  afterAll(async () => {
    await destroyTestApp(ctx);
  });

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

    /**
     * #118 REVERSED the old `ADMIN -> [STUDENT]` rule, and this assertion used to
     * pin it. An admin may now invite a professor: tenants apply for themselves
     * and are approved with per-role seat caps, so `MAX_PROFESSORS` — a number a
     * superadmin chose — is what bounds staff creation, instead of routing every
     * professor through CodeStack support. See the rationale on `invite-policy.ts`.
     *
     * The boundary that remains is the one below: an admin still cannot mint a
     * peer admin, so the matrix is still a privilege boundary and not a formality.
     */
    it('allows an ADMIN to invite a PROFESSOR (#118 reversed the old rule)', async () => {
      const res = await request(http)
        .post('/api/v1/invites')
        .set('Cookie', adminCookie)
        .send({ email: 'prof@codestack.dev', role: 'professor' });
      expect(res.status).toBe(201);
    });

    // The policy matrix, not the @Roles decorator, is what stops this — RolesGuard
    // is minimum-rank, so @Roles(PROFESSOR) admits an ADMIN.
    it('403 role_not_invitable when an ADMIN tries to invite a peer ADMIN', async () => {
      const res = await request(http)
        .post('/api/v1/invites')
        .set('Cookie', adminCookie)
        .send({ email: 'peer-admin@codestack.dev', role: 'admin' });
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
      // Explicitly org-less. Self-registration now lands in the COMMUNITY tenant,
      // so the holding state has to be built rather than inherited — the confined
      // shape #101 fixed still exists, it is just no longer what signup produces.
      const stranded = await registerUser(ctx, {
        email: 'stranded@codestack.dev',
        organizationId: null,
        firstName: 'Stran',
        lastName: 'Ded',
      });
      strandedCookie = stranded.cookie;

      const [row] = (await ds.query(`SELECT organization_id FROM users WHERE email = $1`, [
        'stranded@codestack.dev',
      ])) as { organization_id: string | null }[];
      expect(row.organization_id).toBeNull();
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

  /**
   * #118 — a FAILED delivery must not leave a live invite link in Redis.
   *
   * `MAIL_JOB_OPTIONS` retains failed jobs for 24h for diagnosis while an invite
   * token stays valid for 14 days, and `params.acceptUrl` is the full link. The
   * comment on those options claimed a retained job "must not hold a live accept
   * URL"; it did. This drives a real job to terminal failure and reads the payload
   * back out of the queue.
   */
  describe('a failed mail job is redacted (#118)', () => {
    it('keeps the diagnostic fields and drops the accept URL', async () => {
      const queue = ctx.app.get<Queue>(getQueueToken('mail'));
      await queue.obliterate({ force: true });

      // attempts:1 so one failure is terminal — the production 5 would take minutes
      // of backoff to exhaust, and the hook only fires on the LAST attempt.
      const job = await queue.add(
        JOB_SEND_MAIL,
        {
          to: 'redact-me@codestack.dev',
          // An unknown template makes `renderMail` throw, which is how this drives a
          // REAL terminal failure. With EMAIL_ENABLED=false a well-formed job simply
          // completes — `deliver` returns before touching SMTP — so a valid payload
          // could never exercise the failed path at all.
          template: 'not_a_real_template',
          params: {
            orgName: 'Redaction Org',
            firstName: 'R',
            lastName: 'M',
            inviterName: null,
            acceptUrl: 'http://localhost:5173/invite/TOKEN_THAT_MUST_NOT_PERSIST',
            expiresInDays: 14,
          },
        } as never,
        { attempts: 1, removeOnFail: { age: 86_400 } },
      );

      // Wait for the worker to run it and fail (the template renders, but delivery
      // has nowhere to go in the test app).
      const deadline = Date.now() + 20_000;
      let state = await job.getState();
      while (state !== 'failed' && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 200));
        state = await job.getState();
      }

      // If it did not fail, the assertion below would pass vacuously on a missing
      // job — so require the terminal state explicitly.
      expect(state).toBe('failed');

      const stored = await queue.getJob(job.id as string);
      const raw = JSON.stringify(stored?.data ?? {});
      expect(raw).not.toContain('TOKEN_THAT_MUST_NOT_PERSIST');
      // Diagnosis survives: you can still see who it was for and which template.
      expect(raw).toContain('redact-me@codestack.dev');
      expect(raw).toContain('Redaction Org');
    });
  });

  /**
   * Resend token rotation — section E of #109's click-through ("resend, then open
   * the OLD link -> invalid; the new one works").
   *
   * This path had no e2e coverage at all, and it is the one where the sibling bulk
   * implementation shipped a real bug: `UPDATE ... RETURNING` through the raw
   * driver returns a `[rows, rowCount]` TUPLE, so iterating the result as rows
   * silently yields nothing. A unit mock returning a bare array passes anyway,
   * which is precisely why the assertion below reads the DB and the live queue
   * rather than a mock.
   */
  describe('resend rotates the token', () => {
    const EMAIL = 'resend@codestack.dev';
    let inviteId: string;
    let firstToken: string;

    /** Empties the queue so `lastQueuedMail` cannot pick up a neighbouring job. */
    const drainMail = async (): Promise<void> => {
      const queue = ctx.app.get<Queue>(getQueueToken('mail'));
      await queue.obliterate({ force: true });
    };

    /** Stands in for "two minutes passed" — RESEND_COOLDOWN_MS is 120s. */
    const backdate = async (): Promise<void> => {
      await ds.query(
        `UPDATE org_invites SET last_sent_at = now() - interval '5 minutes' WHERE id = $1`,
        [inviteId],
      );
    };

    beforeAll(async () => {
      await drainMail();
      resetThrottleStorage(ctx);
      const res = await request(http)
        .post('/api/v1/invites')
        .set('Cookie', adminCookie)
        .send({ email: EMAIL, role: 'student' });
      expect(res.status).toBe(201);
      inviteId = res.body.id as string;
      firstToken = tokenFromMail(await lastQueuedMail());
    });

    it('429s a resend inside the per-invite cooldown', async () => {
      // Minting sets `lastSentAt`, so the cooldown is already running. This is a
      // per-INVITE limit the global throttler cannot express, so it needs its own
      // pin — resetThrottleStorage does not clear it.
      resetThrottleStorage(ctx);
      const res = await request(http)
        .post(`/api/v1/invites/${inviteId}/resend`)
        .set('Cookie', adminCookie)
        .send({});
      expect(res.status).toBe(429);
      expect(res.body.reason).toBe('invite_resend_cooldown');
    });

    it('re-mints a DIFFERENT token and bumps sendCount', async () => {
      await backdate();
      await drainMail();
      resetThrottleStorage(ctx);

      const res = await request(http)
        .post(`/api/v1/invites/${inviteId}/resend`)
        .set('Cookie', adminCookie)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.sendCount).toBe(2);
      // The response must still never carry the token itself.
      expect(res.body.token).toBeUndefined();

      const secondToken = tokenFromMail(await lastQueuedMail());
      expect(secondToken).not.toBe(firstToken);

      // The stored hash is the NEW token's, so the old plaintext is unrecoverable.
      const [row] = (await ds.query(`SELECT token_hash FROM org_invites WHERE id = $1`, [
        inviteId,
      ])) as { token_hash: string }[];
      expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(row.token_hash).not.toBe(createHash('sha256').update(firstToken).digest('hex'));
      expect(row.token_hash).toBe(createHash('sha256').update(secondToken).digest('hex'));
    });

    it('the OLD link is dead and reveals nothing', async () => {
      const res = await request(http).get(`/api/v1/invites/${firstToken}/preview`);
      // 200, not a 4xx: a 4xx would put the raw token into the exception filter's
      // `path` field and from there into the log.
      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
      expect(res.body.email).toBeNull();
      expect(res.body.organizationName).toBeNull();
    });

    it('accepting with the OLD token fails, and the NEW one still works', async () => {
      const secondToken = tokenFromMail(await lastQueuedMail());

      resetThrottleStorage(ctx);
      const stale = await request(http)
        .post('/api/v1/invites/accept')
        .send({ token: firstToken, password: 'Password1' });
      // 404 invite_not_found, not a "revoked"/"expired" 403: rotation replaced the
      // hash, so the old token names no row at all. That is also the most opaque
      // answer available — the holder of a superseded link learns nothing.
      expect(stale.status).toBe(404);
      expect(stale.body.reason).toBe('invite_not_found');
      expect(await ds.query(`SELECT 1 FROM users WHERE email = $1`, [EMAIL])).toHaveLength(0);

      resetThrottleStorage(ctx);
      const ok = await request(http)
        .post('/api/v1/invites/accept')
        .send({ token: secondToken, password: 'Password1' });
      expect(ok.status).toBe(200); // @HttpCode(200) on the public accept route
      expect(ok.body.user.email).toBe(EMAIL);
      expect(ok.body.user.organizationId).toBe(orgId);
    });
  });
});
