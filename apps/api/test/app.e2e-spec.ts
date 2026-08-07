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
  loginAs,
  registerUser,
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
   * All three parts are mandatory. `POST /auth/register` lands the user in the
   * COMMUNITY tenant at STUDENT, unverified. This suite's assertions are about an
   * institutional tenant, `chk_users_org_required` rejects an org-less PROFESSOR
   * outright (23514), and `validateCredentials` refuses an unverified account —
   * so the stamp covers org, role and verification, and the re-login is what gets
   * the first two into the issued JWT.
   *
   * Confined org-less (holding-state) behaviour is deliberately NOT covered here —
   * it arrives with `@AllowsUnassigned` (#104) and gets its own suite.
   */
  const joinOrg = async (email: string, role?: Role): Promise<string> => {
    const userRepo = ctx.app.get<Repository<User>>(getRepositoryToken(User));
    const stamped = await userRepo.update(
      { email },
      {
        organizationId: orgId,
        ...(role ? { role } : {}),
        // Stands in for clicking the emailed link (#149). Self-signup mints the
        // account UNVERIFIED, and `validateCredentials` refuses it, so without
        // this the login below 403s `email_unverified`.
        emailVerifiedAt: new Date(),
      },
    );
    // 0 rows means the caller never registered this address — say so here rather
    // than letting the login below fail with an unrelated-looking 401.
    expect(stamped.affected).toBe(1);
    return loginAs(ctx, email);
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
      resetThrottleStorage(ctx);
      const res = await request(http).post('/api/v1/auth/register').send({
        email: 'weak@codestack.dev',
        password: 'weak',
        firstName: 'Weak',
        lastName: 'Pw',
      });
      expect(res.status).toBe(400);
    });

    /**
     * Registration does NOT authenticate the caller and does not describe the
     * account it may or may not have made. Both are deliberate:
     *
     *  - the account is created UNVERIFIED, so there is nothing to issue a
     *    session for until the emailed link is used;
     *  - the response is identical whether or not the address was free, which is
     *    what closes the account-enumeration oracle.
     *
     * Asserted as its own contract rather than through the fixture helper, since
     * this is the behaviour under test.
     */
    it('accepts a registration without authenticating the caller', async () => {
      resetThrottleStorage(ctx);
      const res = await request(http).post('/api/v1/auth/register').send({
        email: 'alice.e2e@codestack.dev',
        password: 'Password1',
        firstName: 'Alice',
        lastName: 'E2E',
      });
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/check your inbox/i);
      // No account details, and no session — a caller cannot learn anything about
      // the address from this response, nor act as it.
      expect(res.body.user).toBeUndefined();
      expect(res.headers['set-cookie']).toBeUndefined();

      // The row exists but is unverified, which is why login is refused below.
      const [row] = (await getDataSource(ctx).query(
        `SELECT email_verified_at FROM users WHERE email = $1`,
        ['alice.e2e@codestack.dev'],
      )) as { email_verified_at: string | null }[];
      expect(row.email_verified_at).toBeNull();
    });

    it('refuses login until the address is confirmed', async () => {
      resetThrottleStorage(ctx);
      const res = await request(http)
        .post('/api/v1/auth/login')
        .send({ email: 'alice.e2e@codestack.dev', password: 'Password1' });
      expect(res.status).toBe(403);
      expect(res.body.reason).toBe('email_unverified');
    });

    /**
     * The old contract answered 409 here. It was replaced on purpose: a distinct
     * status for a taken address is an account-enumeration oracle, so the caller
     * now gets the same 200 and the same sentence, and the MAILBOX OWNER is told
     * instead. Pinned so nobody "fixes" the missing 409 back into existence.
     */
    it('answers a duplicate address identically, creating no second account', async () => {
      resetThrottleStorage(ctx);
      const res = await request(http).post('/api/v1/auth/register').send({
        email: 'alice.e2e@codestack.dev',
        password: 'Password1',
        firstName: 'Alice',
        lastName: 'Dup',
      });
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/check your inbox/i);

      const [row] = (await getDataSource(ctx).query(
        `SELECT count(*)::int AS n, max(first_name) AS first_name FROM users WHERE email = $1`,
        ['alice.e2e@codestack.dev'],
      )) as { n: number; first_name: string }[];
      expect(row.n).toBe(1);
      expect(row.first_name).toBe('Alice'); // the second attempt overwrote nothing
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

    it('logs in and verify succeeds once the address is confirmed', async () => {
      // Confirms the address (and puts her in the suite's tenant, which every
      // later test needs) — the fixture stand-in for clicking the emailed link.
      await joinOrg('alice.e2e@codestack.dev');

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
      // In the suite's tenant, so this 403 comes from RolesGuard — a student left
      // in the community tenant would 403 at a different gate and pass the
      // assertion for the wrong reason.
      const { cookie } = await registerUser(ctx, {
        email: 'bob.e2e@codestack.dev',
        organizationId: orgId,
        firstName: 'Bob',
      });

      const res = await request(http)
        .post('/api/v1/problems')
        .set('Cookie', cookie)
        .send({ title: 'Should Fail', body: 'A student cannot author library problems.' });
      expect(res.status).toBe(403);
    });

    it('allows a student to view another STUDENT profile (by design — only staff are hidden)', async () => {
      const { cookie } = await registerUser(ctx, {
        email: 'dan.e2e@codestack.dev',
        organizationId: orgId,
        firstName: 'Dan',
      });

      const aliceLogin = await request(http)
        .post('/api/v1/auth/login')
        .send({ email: 'alice.e2e@codestack.dev', password: 'Password1' });
      const aliceId: string = aliceLogin.body.user.id;

      const res = await request(http).get(`/api/v1/users/${aliceId}`).set('Cookie', cookie);
      expect(res.status).toBe(200);
    });

    it('blocks a student from viewing a STAFF profile', async () => {
      const { cookie: studentCookie } = await registerUser(ctx, {
        email: 'erin.e2e@codestack.dev',
        organizationId: orgId,
        firstName: 'Erin',
      });

      // The promotion has to carry the org with it: chk_users_org_required's CASE
      // form exempts only 'superadmin' and 'student', so an org-less PROFESSOR
      // raises 23514.
      const { id: staffId } = await registerUser(ctx, {
        email: 'staffmember.e2e@codestack.dev',
        role: Role.PROFESSOR,
        organizationId: orgId,
        firstName: 'Staff',
        lastName: 'Member',
      });

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
      // Self-registration always forces STUDENT into the community tenant, so the
      // role and org are stamped and the JWT reissued by the login inside the
      // helper.
      const prof = await registerUser(ctx, {
        email: 'prof.e2e@codestack.dev',
        role: Role.PROFESSOR,
        organizationId: orgId,
        firstName: 'Prof',
      });
      const profId = prof.id;
      professorCookie = prof.cookie;

      // Same tenant as the professor, or the classroom's studentIds picker is a
      // cross-org reference and assertSameOrg 403s it.
      const student = await registerUser(ctx, {
        email: 'carol.e2e@codestack.dev',
        organizationId: orgId,
        firstName: 'Carol',
      });
      studentId = student.id;
      studentCookie = student.cookie;

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

    // #139, the regression pair. GRADING is `student: false` in
    // MODULE_ACCESS_DEFAULTS and nothing in this suite turns it on, so this org
    // is exactly the "staff grading switched off" case — the state that used to
    // make a student's own score unreachable. `my-score` now lives on
    // StudentGradesController, off that gate; the staff gradebook does not.
    //
    // These two assertions have to stay together: passing the first one alone is
    // also what flipping GRADING on for students in the Module × Role matrix
    // would achieve, and that would open the gradebook with it.
    it('serves a student their OWN score even with the staff GRADING module off', async () => {
      const res = await request(http)
        .get(`/api/v1/grading/assignments/${assignmentId}/my-score`)
        .set('Cookie', studentCookie);
      expect(res.status).toBe(200);
      expect(res.body.userId).toBe(studentId);
      // The professor graded the item above but has not published grades, so the
      // reveal gate (§9.2) still withholds the numbers — 200 with nulls is the
      // correct answer here, not 403.
      expect(res.body.assignmentScore.finalScore).toBeNull();
      expect(res.body.assignmentScore.maxScore).toBe(10);
      expect(res.body.items[0].score).toBeNull();
      expect(res.body.items[0].gradingStatus).toBe('submitted');
    });

    it('still 403s that same student on the staff gradebook', async () => {
      const res = await request(http)
        .get(`/api/v1/grading/assignments/${assignmentId}/students-scores`)
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
      // `registerUser` clears the throttle before registering AND asserts the
      // registration landed, which is what this test needed spelled out inline
      // before: `/auth/register` is throttled (3/min, 10/hour) and the test
      // directly above deliberately drives a 429, so this runs at the throttle
      // boundary. A throttled register used to fail silently — no user row, then
      // an `update` matching 0 rows without complaint, then a login 401 several
      // lines later that pointed nowhere near the cause. The helper throws at the
      // registration instead.
      //
      // Same tenant on purpose: the 403 must come from classroom membership, not
      // from the tenant gate.
      const { cookie: otherCookie } = await registerUser(ctx, {
        email: 'eve.e2e@codestack.dev',
        organizationId: orgId,
        firstName: 'Eve',
      });
      const res = await request(http)
        .get(`/api/v1/submissions/${submissionId}`)
        .set('Cookie', otherCookie);
      expect(res.status).toBe(403);
    });
  });
});
