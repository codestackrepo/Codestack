import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';

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

jest.setTimeout(120_000); // container boot + migrations can take a while on first pull

/** One student's row in the professor gradebook (`GET .../students-scores`). */
interface ScoreRow {
  userId: string;
  assignmentScore: { finalScore: number | null; maxScore: number };
  items: { score: number | null; gradingStatus: string; solved?: boolean | null }[];
}

describe('CodeStack e2e', () => {
  let ctx: TestAppContext;
  let http: import('http').Server;
  let orgId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    http = ctx.app.getHttpServer();
    orgId = await createTestOrg(getDataSource(ctx));
  });

  afterAll(async () => {
    await destroyTestApp(ctx);
  });

  /**
   * Puts a just-registered user into the suite's tenant (and optionally promotes
   * them), then re-authenticates and returns the fresh cookie.
   *
   * Both halves are mandatory. `POST /auth/register` writes `organization_id
   * = NULL` — legal for a STUDENT since 1785520000000, but `TenantContextGuard`
   * (APP_GUARD slot 2) 403s `no_organization` on every route that is not
   * `@Public`, `/auth/verify` included, and `chk_users_org_required` rejects an
   * org-less PROFESSOR outright (23514). So every fixture user needs a tenant,
   * not just the promoted ones. The re-login is what gets the stamped org and role
   * into the issued JWT.
   *
   * Confined org-less (holding-state) behaviour is deliberately NOT covered here —
   * it arrives with `@AllowsUnassigned` (#104) and gets its own suite.
   */
  const joinOrg = async (email: string, role?: Role): Promise<string> => {
    const userRepo = ctx.app.get<Repository<User>>(getRepositoryToken(User));
    const stamped = await userRepo.update(
      { email },
      { organizationId: orgId, ...(role ? { role } : {}) },
    );
    // 0 rows means the caller never registered this address — say so here rather
    // than letting the login below fail with an unrelated-looking 401.
    expect(stamped.affected).toBe(1);
    resetThrottleStorage(ctx);
    const login = await request(http)
      .post('/api/v1/auth/login')
      .send({ email, password: 'Password1' });
    expect(login.status).toBe(200);
    return extractAuthCookies(login.headers['set-cookie'] as unknown as string[]);
  };

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

      // Self-registration lands org-less; every later test in this suite drives
      // authenticated routes, so give her the tenant now.
      expect(res.body.user.organizationId ?? null).toBeNull();
      await joinOrg('alice.e2e@codestack.dev');
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
      await request(http).post('/api/v1/auth/register').send({
        email: 'bob.e2e@codestack.dev',
        password: 'Password1',
        firstName: 'Bob',
        lastName: 'E2E',
      });
      // In the tenant, so this 403 comes from RolesGuard — an org-less student
      // would 403 at the tenant gate instead and pass the assertion for the
      // wrong reason.
      const cookie = await joinOrg('bob.e2e@codestack.dev');

      const res = await request(http)
        .post('/api/v1/problems')
        .set('Cookie', cookie)
        .send({ title: 'Should Fail', body: 'A student cannot author library problems.' });
      expect(res.status).toBe(403);
    });

    it('allows a student to view another STUDENT profile (by design — only staff are hidden)', async () => {
      await request(http).post('/api/v1/auth/register').send({
        email: 'dan.e2e@codestack.dev',
        password: 'Password1',
        firstName: 'Dan',
        lastName: 'E2E',
      });
      const cookie = await joinOrg('dan.e2e@codestack.dev');

      const aliceLogin = await request(http)
        .post('/api/v1/auth/login')
        .send({ email: 'alice.e2e@codestack.dev', password: 'Password1' });
      const aliceId: string = aliceLogin.body.user.id;

      const res = await request(http).get(`/api/v1/users/${aliceId}`).set('Cookie', cookie);
      expect(res.status).toBe(200);
    });

    it('blocks a student from viewing a STAFF profile', async () => {
      await request(http).post('/api/v1/auth/register').send({
        email: 'erin.e2e@codestack.dev',
        password: 'Password1',
        firstName: 'Erin',
        lastName: 'E2E',
      });
      const studentCookie = await joinOrg('erin.e2e@codestack.dev');

      const staffReg = await request(http).post('/api/v1/auth/register').send({
        email: 'staffmember.e2e@codestack.dev',
        password: 'Password1',
        firstName: 'Staff',
        lastName: 'Member',
      });
      const staffId: string = staffReg.body.user.id;
      // The promotion has to carry the org with it: chk_users_org_required's CASE
      // form exempts only 'superadmin' and 'student', so an org-less PROFESSOR
      // raises 23514.
      await joinOrg('staffmember.e2e@codestack.dev', Role.PROFESSOR);

      const res = await request(http).get(`/api/v1/users/${staffId}`).set('Cookie', studentCookie);
      expect(res.status).toBe(403);
    });
  });

  describe('judge flow: submit -> async BullMQ judge -> verdict -> scoring', () => {
    let professorCookie: string;
    let studentCookie: string;
    let studentId: string;
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

      // Self-registration always forces STUDENT and no org — stamp both via the
      // repository (a normal e2e-setup shortcut) then re-login so the issued JWT
      // carries the updated role and tenant.
      professorCookie = await joinOrg('prof.e2e@codestack.dev', Role.PROFESSOR);

      const studentReg = await request(http).post('/api/v1/auth/register').send({
        email: 'carol.e2e@codestack.dev',
        password: 'Password1',
        firstName: 'Carol',
        lastName: 'E2E',
      });
      studentId = studentReg.body.user.id;
      // Same tenant as the professor, or the classroom's studentIds picker is a
      // cross-org reference and assertSameOrg 403s it.
      studentCookie = await joinOrg('carol.e2e@codestack.dev');

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

      // Attach as an ASSIGNMENT ITEM, not via the legacy
      // `POST /assignments/:id/problems/import`. Both create the
      // AssignmentProblem, but only this path also writes the `assignment_items`
      // row — and the gradebook (`loadItems`) and score rollup
      // (`recomputeAssignmentScore`) are both keyed on items. Imported-only
      // problems are invisible to scoring entirely; see the note in the PR.
      const item = await request(http)
        .post(`/api/v1/assignments/${assignmentId}/items`)
        .set('Cookie', professorCookie)
        .send({ kind: 'coding', sourceProblemId: problemId, score: 10, languages: ['python'] });
      expect(item.status).toBe(201);
      assignmentProblemId = item.body.assignmentProblemId;
      expect(assignmentProblemId).toBeTruthy();
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

    // Polled as the PROFESSOR, not the student. A student's own ASSIGNMENT
    // submission is blinded (§9.1) — every verdict-bearing field is coarsened —
    // so the student's view can never observe convergence at all. Staff is the
    // only vantage point from which "the worker judged it" is even visible.
    it('the real BullMQ worker judges it and staff polling converges to Accepted with per-testcase results', async () => {
      let final: Record<string, unknown> | undefined;
      for (let i = 0; i < 50; i++) {
        const res = await request(http)
          .get(`/api/v1/submissions/${submissionId}`)
          .set('Cookie', professorCookie);
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

    it("blinds the student's own view of that same finalized assignment submission", async () => {
      const res = await request(http)
        .get(`/api/v1/submissions/${submissionId}`)
        .set('Cookie', studentCookie);
      expect(res.status).toBe(200);
      // BLIND_STATUS — "submitted, under review", never the real verdict.
      expect(res.body.status).toBe('submitted');
      expect(res.body.passedTestcaseCount).toBe(0);
      expect(res.body.totalTestcaseCount).toBe(0);
      expect(res.body.testCaseResults).toBeUndefined();
    });

    // Read through the PROFESSOR gradebook, which is never reveal-gated. The
    // student's own /my-score would report finalScore: null regardless, because the
    // assignment is not GRADE_PUBLISHED (§9.2).
    const gradebookRow = async (): Promise<ScoreRow> => {
      const res = await request(http)
        .get(`/api/v1/grading/assignments/${assignmentId}/students-scores`)
        .set('Cookie', professorCookie);
      expect(res.status).toBe(200);
      const row = (res.body as ScoreRow[]).find((r) => r.userId === studentId);
      expect(row).toBeDefined();
      return row as ScoreRow;
    };

    it('finalizing marks the coding item awaiting review and awards NOTHING', async () => {
      // Award-on-accept was deliberately removed (§5.3, decision #3): an Accepted
      // verdict tracks the attempt, pins the representative submission and moves
      // the item to 'submitted', but scoring is professor-driven, so the points
      // stay 0 until someone grades.
      const row = await gradebookRow();
      expect(row.items[0].gradingStatus).toBe('submitted');
      expect(row.items[0].score).toBe(0);
      expect(row.assignmentScore.finalScore).toBe(0);
      expect(row.assignmentScore.maxScore).toBe(10);
      // `solved` is NOT "the verdict was Accepted" — it is
      // `submissionId !== null && score > 0`, so it stays false through an
      // accepted-but-ungraded item. Pinned here because the name invites the
      // other reading.
      expect(row.items[0].solved).toBe(false);
    });

    it('a professor grading the item rolls the score up to the assignment total', async () => {
      const graded = await request(http)
        .patch(`/api/v1/grading/problems/${assignmentProblemId}/students/${studentId}`)
        .set('Cookie', professorCookie)
        .send({ score: 10, feedback: 'Correct.' });
      expect(graded.status).toBe(200);

      const row = await gradebookRow();
      expect(row.items[0].score).toBe(10);
      expect(row.items[0].gradingStatus).toBe('graded');
      expect(row.assignmentScore.finalScore).toBe(10);
    });

    // KNOWN DEFECT, asserted so it cannot change silently: `my-score` is a
    // student's own score, but it sits on GradingController, which carries a
    // class-level @RequiresModule(GRADING) — and MODULE_ACCESS_DEFAULTS marks
    // GRADING `student: false` ("staff-only gradebook"). So the one grading route
    // written FOR students is the one students cannot reach. Fixing it is a
    // module-access decision (either the route leaves this controller or it opts
    // out of the gate), not an e2e change — see the module/feature-perms epic.
    it('403s a student on /my-score today, because GRADING is staff-only by default', async () => {
      const res = await request(http)
        .get(`/api/v1/grading/assignments/${assignmentId}/my-score`)
        .set('Cookie', studentCookie);
      expect(res.status).toBe(403);
      expect(res.body.reason).toBe('module_disabled');
    });

    it('a second submission within the same minute is throttled (1/min)', async () => {
      const res = await request(http)
        .post('/api/v1/code-execution/submit')
        .set('Cookie', studentCookie)
        .send({ assignmentProblemId, language: 'python', userCode: 'second attempt' });
      expect(res.status).toBe(429);
    });

    it('a student cannot view another classroom submission (IDOR check)', async () => {
      // resetThrottleStorage BEFORE the register, and assert it landed.
      //
      // `/auth/register` is throttled 5/min, and the test directly above this one
      // deliberately drives a 429 — so this describe runs at the throttle boundary.
      // A throttled register here used to fail silently: no user row, then
      // `joinOrg`'s `userRepo.update` matched 0 rows without complaint (TypeORM
      // `update` does not throw), and the suite failed several lines later on a
      // login 401 that pointed nowhere near the cause. That was a real flake in the
      // full-suite run.
      resetThrottleStorage(ctx);
      const registered = await request(http).post('/api/v1/auth/register').send({
        email: 'eve.e2e@codestack.dev',
        password: 'Password1',
        firstName: 'Eve',
        lastName: 'E2E',
      });
      expect(registered.status).toBe(201);
      // Same tenant on purpose: the 403 must come from classroom membership, not
      // from the tenant gate.
      const otherCookie = await joinOrg('eve.e2e@codestack.dev');
      const res = await request(http)
        .get(`/api/v1/submissions/${submissionId}`)
        .set('Cookie', otherCookie);
      expect(res.status).toBe(403);
    });
  });
});
