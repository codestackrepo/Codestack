import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';

import { Role } from '../src/common/enums/role.enum';
import { User } from '../src/modules/users/entities/user.entity';
import {
  createTestApp,
  destroyTestApp,
  extractAuthCookies,
  resetThrottleStorage,
  TestAppContext,
} from './utils/test-app';

jest.setTimeout(120_000); // container boot + migrations can take a while on first pull

describe('CodeStack e2e', () => {
  let ctx: TestAppContext;
  let http: import('http').Server;

  beforeAll(async () => {
    ctx = await createTestApp();
    http = ctx.app.getHttpServer();
  });

  afterAll(async () => {
    await destroyTestApp(ctx);
  });

  // Runs first, deliberately, before any other test consumes the shared
  // per-IP login throttle bucket for this app instance.
  describe('rate limiting', () => {
    it('throttles login after the configured per-minute limit (10/min)', async () => {
      let sawThrottled = false;
      for (let i = 0; i < 12; i++) {
        const res = await request(http)
          .post('/api/v1/auth/login')
          .send({ email: 'nobody@codestack.dev', password: 'wrong-password' });
        if (res.status === 429) {
          sawThrottled = true;
          break;
        }
        expect(res.status).toBe(401); // wrong credentials, but not yet throttled
      }
      expect(sawThrottled).toBe(true);
      // This test's whole point was to exhaust the shared (in-memory,
      // per-process) login throttle bucket — every later test needs a clean
      // one, since it's keyed by IP and every unauthenticated request in this
      // suite comes from the same test client.
      resetThrottleStorage(ctx);
    });
  });

  describe('auth flow', () => {
    it('rejects registration with a weak password', async () => {
      const res = await request(http).post('/api/v1/auth/register').send({
        email: 'weak@codestack.dev',
        password: 'weak',
        firstName: 'Weak',
        lastName: 'Pw',
      });
      expect(res.status).toBe(400);
    });

    it('registers a user, sets httpOnly auth cookies, and never returns the password', async () => {
      const res = await request(http).post('/api/v1/auth/register').send({
        email: 'alice.e2e@codestack.dev',
        password: 'Password1',
        firstName: 'Alice',
        lastName: 'E2E',
      });
      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Registration successful');
      expect(res.body.user.email).toBe('alice.e2e@codestack.dev');
      expect(res.body.user.password).toBeUndefined();
      expect(res.body.user.passwordHash).toBeUndefined();
      const setCookie = res.headers['set-cookie'] as unknown as string[];
      expect(setCookie.some((c) => c.startsWith('access_token='))).toBe(true);
      expect(setCookie.some((c) => c.startsWith('refresh_token='))).toBe(true);
      expect(setCookie.every((c) => /HttpOnly/i.test(c))).toBe(true);
    });

    it('rejects duplicate registration with the same email', async () => {
      const res = await request(http).post('/api/v1/auth/register').send({
        email: 'alice.e2e@codestack.dev',
        password: 'Password1',
        firstName: 'Alice',
        lastName: 'Dup',
      });
      expect(res.status).toBe(409);
    });

    it('rejects verify without any auth cookie', async () => {
      const res = await request(http).get('/api/v1/auth/verify');
      expect(res.status).toBe(401);
    });

    it('rejects login with the wrong password', async () => {
      const res = await request(http)
        .post('/api/v1/auth/login')
        .send({ email: 'alice.e2e@codestack.dev', password: 'WrongPassword1' });
      expect(res.status).toBe(401);
    });

    it('logs in and verify succeeds with the issued cookie', async () => {
      const login = await request(http)
        .post('/api/v1/auth/login')
        .send({ email: 'alice.e2e@codestack.dev', password: 'Password1' });
      expect(login.status).toBe(200);
      const cookie = extractAuthCookies(login.headers['set-cookie'] as unknown as string[]);

      const verify = await request(http).get('/api/v1/auth/verify').set('Cookie', cookie);
      expect(verify.status).toBe(200);
      expect(verify.body.isValid).toBe(true);
      expect(verify.body.user.email).toBe('alice.e2e@codestack.dev');
    });

    it('logout clears the session (verify fails afterwards)', async () => {
      const login = await request(http)
        .post('/api/v1/auth/login')
        .send({ email: 'alice.e2e@codestack.dev', password: 'Password1' });
      const cookie = extractAuthCookies(login.headers['set-cookie'] as unknown as string[]);

      const logout = await request(http).post('/api/v1/auth/logout').set('Cookie', cookie);
      expect(logout.status).toBe(200);
      const logoutCookies = logout.headers['set-cookie'] as unknown as string[];
      // Cleared cookies carry an immediate expiry.
      expect(
        logoutCookies.some((c) => /access_token=;/.test(c) || /Expires=Thu, 01 Jan 1970/i.test(c)),
      ).toBe(true);
    });
  });

  describe('RBAC', () => {
    beforeAll(() => resetThrottleStorage(ctx));

    it('blocks a plain student from creating a problem', async () => {
      const reg = await request(http).post('/api/v1/auth/register').send({
        email: 'bob.e2e@codestack.dev',
        password: 'Password1',
        firstName: 'Bob',
        lastName: 'E2E',
      });
      const cookie = extractAuthCookies(reg.headers['set-cookie'] as unknown as string[]);

      const res = await request(http)
        .post('/api/v1/problems')
        .set('Cookie', cookie)
        .send({ title: 'Should Fail', body: 'A student cannot author library problems.' });
      expect(res.status).toBe(403);
    });

    it('allows a student to view another STUDENT profile (by design — only staff are hidden)', async () => {
      const reg = await request(http).post('/api/v1/auth/register').send({
        email: 'dan.e2e@codestack.dev',
        password: 'Password1',
        firstName: 'Dan',
        lastName: 'E2E',
      });
      const cookie = extractAuthCookies(reg.headers['set-cookie'] as unknown as string[]);

      const aliceLogin = await request(http)
        .post('/api/v1/auth/login')
        .send({ email: 'alice.e2e@codestack.dev', password: 'Password1' });
      const aliceId: string = aliceLogin.body.user.id;

      const res = await request(http).get(`/api/v1/users/${aliceId}`).set('Cookie', cookie);
      expect(res.status).toBe(200);
    });

    it('blocks a student from viewing a STAFF profile', async () => {
      const reg = await request(http).post('/api/v1/auth/register').send({
        email: 'erin.e2e@codestack.dev',
        password: 'Password1',
        firstName: 'Erin',
        lastName: 'E2E',
      });
      const studentCookie = extractAuthCookies(reg.headers['set-cookie'] as unknown as string[]);

      const staffReg = await request(http).post('/api/v1/auth/register').send({
        email: 'staffmember.e2e@codestack.dev',
        password: 'Password1',
        firstName: 'Staff',
        lastName: 'Member',
      });
      const staffId: string = staffReg.body.user.id;
      const userRepo = ctx.app.get<Repository<User>>(getRepositoryToken(User));
      await userRepo.update({ id: staffId }, { role: Role.PROFESSOR });

      const res = await request(http).get(`/api/v1/users/${staffId}`).set('Cookie', studentCookie);
      expect(res.status).toBe(403);
    });
  });

  describe('judge flow: submit -> async BullMQ judge -> verdict -> scoring', () => {
    let professorCookie: string;
    let studentCookie: string;
    let assignmentId: string;
    let assignmentProblemId: string;
    let submissionId: string;

    beforeAll(async () => {
      resetThrottleStorage(ctx);
      const profReg = await request(http).post('/api/v1/auth/register').send({
        email: 'prof.e2e@codestack.dev',
        password: 'Password1',
        firstName: 'Prof',
        lastName: 'E2E',
      });
      const profId: string = profReg.body.user.id;

      // Self-registration always forces STUDENT — promote directly via the
      // repository (a normal e2e-setup shortcut) then re-login so the issued
      // JWT actually carries the updated role claim.
      const userRepo = ctx.app.get<Repository<User>>(getRepositoryToken(User));
      await userRepo.update({ id: profId }, { role: Role.PROFESSOR });
      const profLogin = await request(http)
        .post('/api/v1/auth/login')
        .send({ email: 'prof.e2e@codestack.dev', password: 'Password1' });
      professorCookie = extractAuthCookies(profLogin.headers['set-cookie'] as unknown as string[]);

      const studentReg = await request(http).post('/api/v1/auth/register').send({
        email: 'carol.e2e@codestack.dev',
        password: 'Password1',
        firstName: 'Carol',
        lastName: 'E2E',
      });
      studentCookie = extractAuthCookies(studentReg.headers['set-cookie'] as unknown as string[]);
      const studentId: string = studentReg.body.user.id;

      const classroom = await request(http)
        .post('/api/v1/classrooms')
        .set('Cookie', professorCookie)
        .send({
          courseId: 'E2E-101',
          title: 'E2E Judge Classroom',
          startDate: '2020-01-01T00:00:00Z',
          endDate: '2030-01-01T00:00:00Z',
          professorId: profId,
          studentIds: [studentId],
        });
      const classroomId: string = classroom.body.id;

      const assignment = await request(http)
        .post('/api/v1/assignments')
        .set('Cookie', professorCookie)
        .send({
          title: 'E2E Assignment',
          startDate: '2020-01-01T00:00:00Z',
          endDate: '2030-01-01T00:00:00Z',
          classroomId,
        });
      assignmentId = assignment.body.id;
      // Trigger the SCHEDULED -> ACTIVE time-based transition.
      await request(http).get(`/api/v1/assignments/${assignmentId}`).set('Cookie', professorCookie);

      const problem = await request(http)
        .post('/api/v1/problems')
        .set('Cookie', professorCookie)
        .send({
          title: 'E2E Problem — Always 42',
          body: 'Return 42.',
          difficulty: 'easy',
          testCases: [
            { inputData: '', expectedOutput: '42', type: 'sample' },
            { inputData: '', expectedOutput: '42', type: 'hidden' },
          ],
        });
      const problemId: string = problem.body.id;

      const ap = await request(http)
        .post(`/api/v1/assignments/${assignmentId}/problems/import`)
        .set('Cookie', professorCookie)
        .send({ sourceProblemId: problemId, score: 10, languages: ['python'] });
      assignmentProblemId = ap.body.id;
    });

    it('submit enqueues the job and returns 202 Pending immediately', async () => {
      const res = await request(http)
        .post('/api/v1/code-execution/submit')
        .set('Cookie', studentCookie)
        .send({
          assignmentProblemId,
          language: 'python',
          userCode: 'irrelevant — executor is faked',
        });
      expect(res.status).toBe(202);
      expect(res.body.status).toBe('Pending');
      expect(res.body.submissionId).toBeTruthy();
      submissionId = res.body.submissionId;
    });

    it('the real BullMQ worker judges it and polling converges to Accepted with per-testcase results', async () => {
      let final: Record<string, unknown> | undefined;
      for (let i = 0; i < 50; i++) {
        const res = await request(http)
          .get(`/api/v1/submissions/${submissionId}`)
          .set('Cookie', studentCookie);
        if (res.body.status !== 'Pending' && res.body.status !== 'Running') {
          final = res.body;
          break;
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      expect(final).toBeDefined();
      expect(final?.status).toBe('Accepted');
      expect(final?.passedTestcaseCount).toBe(2);
      expect(final?.totalTestcaseCount).toBe(2);
      expect(Array.isArray(final?.testCaseResults)).toBe(true);
      expect((final?.testCaseResults as unknown[]).length).toBe(2);
    });

    it('the award-on-accept scoring event fired: student now has full points', async () => {
      const res = await request(http)
        .get(`/api/v1/grading/assignments/${assignmentId}/my-score`)
        .set('Cookie', studentCookie);
      expect(res.status).toBe(200);
      expect(res.body.assignmentScore.finalScore).toBe(10);
      expect(res.body.problems[0].solved).toBe(true);
    });

    it('a second submission within the same minute is throttled (1/min)', async () => {
      const res = await request(http)
        .post('/api/v1/code-execution/submit')
        .set('Cookie', studentCookie)
        .send({ assignmentProblemId, language: 'python', userCode: 'second attempt' });
      expect(res.status).toBe(429);
    });

    it('a student cannot view another classroom submission (IDOR check)', async () => {
      const otherReg = await request(http).post('/api/v1/auth/register').send({
        email: 'eve.e2e@codestack.dev',
        password: 'Password1',
        firstName: 'Eve',
        lastName: 'E2E',
      });
      const otherCookie = extractAuthCookies(otherReg.headers['set-cookie'] as unknown as string[]);
      const res = await request(http)
        .get(`/api/v1/submissions/${submissionId}`)
        .set('Cookie', otherCookie);
      expect(res.status).toBe(403);
    });
  });
});
