/**
 * E2E for problem feedback (#75).
 *
 * The whole point of this table is one non-obvious decision: `organization_id` is
 * the AUTHOR's org, never the problem's. A global problem has
 * `problems.organization_id IS NULL`, so inheriting it would strand every doubt
 * about a platform problem in a tenant `scopeToOrg` cannot match and no staff can
 * reach.
 *
 * That decision is only observable with TWO orgs commenting on the SAME global
 * problem, which is what this suite builds. A single-org suite would pass against
 * the broken version.
 */
import request from 'supertest';
import { DataSource } from 'typeorm';

import { Role } from '../src/common/enums/role.enum';
import {
  createTestApp,
  createTestOrg,
  destroyTestApp,
  getDataSource,
  registerUser,
  TestAppContext,
} from './utils/test-app';

jest.setTimeout(120_000);

describe('problem feedback (e2e)', () => {
  let ctx: TestAppContext;
  let http: import('http').Server;
  let ds: DataSource;
  let orgA: string;
  let orgB: string;

  const id: Record<string, string> = {};
  let aStudent: string;
  let aProf: string;
  let bProf: string;
  let bStudent: string;
  let saCookie: string;

  let globalProblemId: string;
  let orgAProblemId: string;

  const cast = async (email: string, role: Role, org: string | null): Promise<string> => {
    const user = await registerUser(ctx, { email, role, organizationId: org, firstName: 'Fb' });
    id[email] = user.id;
    return user.cookie;
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    http = ctx.app.getHttpServer();
    ds = getDataSource(ctx);
    orgA = await createTestOrg(ds);
    orgB = await createTestOrg(ds);

    aStudent = await cast('fb-a-stu@codestack.dev', Role.STUDENT, orgA);
    aProf = await cast('fb-a-prof@codestack.dev', Role.PROFESSOR, orgA);
    bProf = await cast('fb-b-prof@codestack.dev', Role.PROFESSOR, orgB);
    bStudent = await cast('fb-b-stu@codestack.dev', Role.STUDENT, orgB);
    saCookie = await cast('fb-sa@codestack.dev', Role.SUPERADMIN, null);

    // A SHARED GLOBAL problem — visible to both tenants, owned by neither.
    const g = await request(http).post('/api/v1/problems').set('Cookie', saCookie).send({
      title: 'Global Two Sum',
      body: 'Find two numbers.',
      difficulty: 'easy',
      scope: 'global',
      visibility: 'shared',
    });
    expect(g.status).toBe(201);
    globalProblemId = g.body.id as string;

    // An org-A problem, shared so org A's student can see it.
    const o = await request(http).post('/api/v1/problems').set('Cookie', aProf).send({
      title: 'Org A Problem',
      body: 'Org scoped.',
      difficulty: 'easy',
      visibility: 'shared',
    });
    expect(o.status).toBe(201);
    orgAProblemId = o.body.id as string;
  });

  afterAll(async () => {
    await destroyTestApp(ctx);
  });

  const raise = (cookie: string, problemId: string, kind = 'doubt', body = 'why does this fail?') =>
    request(http)
      .post(`/api/v1/problems/${problemId}/feedback`)
      .set('Cookie', cookie)
      .send({ kind, body });

  describe('a student raises feedback', () => {
    it('accepts a doubt on an org problem', async () => {
      const res = await raise(aStudent, orgAProblemId);
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('open');
      expect(res.body.kind).toBe('doubt');
      // Never echo the tenant id into a student-visible payload.
      expect(res.body.organizationId).toBeUndefined();
    });

    it('anchors a GLOBAL problem doubt to the STUDENT org, not to NULL', async () => {
      const res = await raise(aStudent, globalProblemId);
      expect(res.status).toBe(201);

      // The assertion the whole table exists for. Read the row directly: the DTO
      // deliberately does not project organization_id, so only the DB can prove it.
      const [row] = (await ds.query(
        `SELECT organization_id, author_id FROM problem_feedback WHERE id = $1`,
        [res.body.id],
      )) as { organization_id: string; author_id: string }[];
      expect(row.organization_id).toBe(orgA);
      expect(row.author_id).toBe(id['fb-a-stu@codestack.dev']);

      // And the problem it is about really is the org-less global one.
      const [p] = (await ds.query(`SELECT organization_id, scope FROM problems WHERE id = $1`, [
        globalProblemId,
      ])) as { organization_id: string | null; scope: string }[];
      expect(p.organization_id).toBeNull();
      expect(p.scope).toBe('global');
    });

    it('notifies the AUTHOR own org staff for a doubt on a global problem', async () => {
      const rows = (await ds.query(
        `SELECT user_id FROM notifications WHERE type = 'problem_feedback_received'`,
      )) as { user_id: string }[];
      const notified = rows.map((r) => r.user_id);

      expect(notified).toContain(id['fb-a-prof@codestack.dev']);
      // The decisive half: org B's professor must NOT be paged about org A's doubt,
      // even though the problem is global and equally visible to them.
      expect(notified).not.toContain(id['fb-b-prof@codestack.dev']);
      // And never the student who raised it.
      expect(notified).not.toContain(id['fb-a-stu@codestack.dev']);
    });

    it('does NOT notify anyone for an issue or a suggestion', async () => {
      const before = (await ds.query(
        `SELECT count(*)::int AS n FROM notifications WHERE type = 'problem_feedback_received'`,
      )) as { n: number }[];
      const res = await raise(aStudent, orgAProblemId, 'issue', 'Test case 3 looks wrong.');
      expect(res.status).toBe(201);
      const after = (await ds.query(
        `SELECT count(*)::int AS n FROM notifications WHERE type = 'problem_feedback_received'`,
      )) as { n: number }[];
      expect(after[0].n).toBe(before[0].n);
    });

    it('400s a body below the minimum length', async () => {
      const res = await raise(aStudent, orgAProblemId, 'doubt', 'x');
      expect(res.status).toBe(400);
    });

    it('rejects feedback on a problem the actor cannot see', async () => {
      // orgAProblemId belongs to org A; org B's student has no visibility of it.
      const res = await raise(bStudent, orgAProblemId);
      expect([403, 404]).toContain(res.status);
      const [row] = (await ds.query(
        `SELECT count(*)::int AS n FROM problem_feedback WHERE author_id = $1`,
        [id['fb-b-stu@codestack.dev']],
      )) as { n: number }[];
      expect(row.n).toBe(0);
    });
  });

  describe('cross-tenant isolation on the SAME global problem', () => {
    it("org B's staff cannot see org A's feedback about it", async () => {
      // Org B's student raises their own doubt on the same global problem.
      const bRaised = await raise(bStudent, globalProblemId, 'doubt', 'B side question');
      expect(bRaised.status).toBe(201);

      const asB = await request(http)
        .get(`/api/v1/problems/${globalProblemId}/feedback`)
        .set('Cookie', bProf);
      expect(asB.status).toBe(200);
      const bodies: string[] = asB.body.map((f: { body: string }) => f.body);
      expect(bodies).toContain('B side question');
      expect(bodies).not.toContain('why does this fail?'); // org A's

      const asA = await request(http)
        .get(`/api/v1/problems/${globalProblemId}/feedback`)
        .set('Cookie', aProf);
      const aBodies: string[] = asA.body.map((f: { body: string }) => f.body);
      expect(aBodies).toContain('why does this fail?');
      expect(aBodies).not.toContain('B side question');
    });

    it('the inbox is org-bounded too', async () => {
      const asB = await request(http).get('/api/v1/feedback?status=open').set('Cookie', bProf);
      expect(asB.status).toBe(200);
      const bodies: string[] = asB.body.map((f: { body: string }) => f.body);
      expect(bodies.every((b) => b !== 'why does this fail?')).toBe(true);
    });
  });

  describe('read visibility inside one org', () => {
    it('a student sees only their OWN feedback on the thread', async () => {
      // A second org-A student comments, then the first must not see it.
      const other = await cast('fb-a-stu2@codestack.dev', Role.STUDENT, orgA);
      const mine = await raise(other, orgAProblemId, 'doubt', 'second student question');
      expect(mine.status).toBe(201);

      const asFirst = await request(http)
        .get(`/api/v1/problems/${orgAProblemId}/feedback`)
        .set('Cookie', aStudent);
      const bodies: string[] = asFirst.body.map((f: { body: string }) => f.body);
      expect(bodies).not.toContain('second student question');
      expect(bodies).toContain('why does this fail?');
    });

    it('staff see every row in their org for that problem', async () => {
      const asProf = await request(http)
        .get(`/api/v1/problems/${orgAProblemId}/feedback`)
        .set('Cookie', aProf);
      const bodies: string[] = asProf.body.map((f: { body: string }) => f.body);
      expect(bodies).toContain('second student question');
      expect(bodies).toContain('why does this fail?');
    });

    it('403s a STUDENT on the staff inbox', async () => {
      const res = await request(http).get('/api/v1/feedback').set('Cookie', aStudent);
      expect(res.status).toBe(403);
    });
  });

  describe('resolve', () => {
    let openId: string;

    beforeAll(async () => {
      const res = await raise(aStudent, orgAProblemId, 'doubt', 'resolve me');
      expect(res.status).toBe(201);
      openId = res.body.id as string;
    });

    it('403s a STUDENT trying to resolve', async () => {
      const res = await request(http)
        .patch(`/api/v1/feedback/${openId}/resolve`)
        .set('Cookie', aStudent)
        .send({ resolutionNote: 'I fixed it myself' });
      expect(res.status).toBe(403);
    });

    it('404s a cross-org resolve without revealing the row exists', async () => {
      const res = await request(http)
        .patch(`/api/v1/feedback/${openId}/resolve`)
        .set('Cookie', bProf)
        .send({});
      expect(res.status).toBe(404);
      const [row] = (await ds.query(`SELECT status FROM problem_feedback WHERE id = $1`, [
        openId,
      ])) as { status: string }[];
      expect(row.status).toBe('open');
    });

    it('resolves once, stamping the resolver, and notifies the author', async () => {
      const res = await request(http)
        .patch(`/api/v1/feedback/${openId}/resolve`)
        .set('Cookie', aProf)
        .send({ resolutionNote: 'Answered in class.' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('resolved');
      expect(res.body.resolutionNote).toBe('Answered in class.');
      expect(res.body.resolvedById).toBe(id['fb-a-prof@codestack.dev']);
      expect(res.body.resolvedAt).not.toBeNull();

      const notified = (await ds.query(
        `SELECT user_id FROM notifications WHERE type = 'problem_feedback_resolved'`,
      )) as { user_id: string }[];
      expect(notified.map((n) => n.user_id)).toContain(id['fb-a-stu@codestack.dev']);
    });

    it('the second resolve loses the race instead of overwriting the first', async () => {
      const res = await request(http)
        .patch(`/api/v1/feedback/${openId}/resolve`)
        .set('Cookie', aProf)
        .send({ resolutionNote: 'overwriting note' });
      expect(res.status).toBe(403);
      expect(res.body.reason).toBe('feedback_not_open');

      const [row] = (await ds.query(`SELECT resolution_note FROM problem_feedback WHERE id = $1`, [
        openId,
      ])) as { resolution_note: string }[];
      expect(row.resolution_note).toBe('Answered in class.'); // first writer wins
    });

    it('filters the inbox by status', async () => {
      const open = await request(http).get('/api/v1/feedback?status=open').set('Cookie', aProf);
      expect(open.body.every((f: { status: string }) => f.status === 'open')).toBe(true);
      const done = await request(http).get('/api/v1/feedback?status=resolved').set('Cookie', aProf);
      expect(done.body.some((f: { id: string }) => f.id === openId)).toBe(true);
    });
  });

  describe('the DB refuses an inconsistent resolution state', () => {
    it('chk_problem_feedback_resolution blocks resolved-without-a-resolver', async () => {
      const err = await ds
        .query(
          `INSERT INTO problem_feedback
             (problem_id, author_id, organization_id, kind, body, status)
           VALUES ($1,$2,$3,'doubt','raw','resolved')`,
          [orgAProblemId, id['fb-a-stu@codestack.dev'], orgA],
        )
        .catch((e: unknown) => e);
      expect((err as { code?: string }).code).toBe('23514');
    });

    it('lets a RESOLVER be deleted without destroying the resolution', async () => {
      // Regression pin for a bug in the first draft of this migration. The resolver
      // FK is ON DELETE SET NULL, which fires an UPDATE that re-evaluates
      // chk_problem_feedback_resolution — so a CHECK requiring
      // `resolved_by_id IS NOT NULL` when resolved made deleting any staff member
      // who had ever resolved feedback fail outright with a 23514. The constraint
      // keys on resolved_at alone for exactly this reason.
      const leaver = await cast('fb-a-leaver@codestack.dev', Role.PROFESSOR, orgA);
      const raised = await raise(aStudent, orgAProblemId, 'doubt', 'resolved by a leaver');
      const fid = raised.body.id as string;

      const done = await request(http)
        .patch(`/api/v1/feedback/${fid}/resolve`)
        .set('Cookie', leaver)
        .send({ resolutionNote: 'handled' });
      expect(done.status).toBe(200);

      // The account goes away. This DELETE is what used to fail.
      await ds.query(`DELETE FROM users WHERE id = $1`, [id['fb-a-leaver@codestack.dev']]);

      const [row] = (await ds.query(
        `SELECT status, resolved_by_id, resolved_at, resolution_note
           FROM problem_feedback WHERE id = $1`,
        [fid],
      )) as {
        status: string;
        resolved_by_id: string | null;
        resolved_at: Date | null;
        resolution_note: string;
      }[];
      expect(row.status).toBe('resolved'); // the resolution survives
      expect(row.resolved_by_id).toBeNull(); // attribution is gone, as designed
      expect(row.resolved_at).not.toBeNull(); // and this is what carries the state
      expect(row.resolution_note).toBe('handled');
    });

    it('chk_problem_feedback_kind blocks an unknown kind', async () => {
      const err = await ds
        .query(
          `INSERT INTO problem_feedback
             (problem_id, author_id, organization_id, kind, body)
           VALUES ($1,$2,$3,'complaint','raw')`,
          [orgAProblemId, id['fb-a-stu@codestack.dev'], orgA],
        )
        .catch((e: unknown) => e);
      expect((err as { code?: string }).code).toBe('23514');
    });
  });
});
