/**
 * E2E for discussion topics (#76).
 *
 * The rule this suite exists to prove: on a GLOBAL topic, comments are
 * ORG-PARTITIONED. The topic is shared across every tenant; the discussion under it
 * is not.
 *
 * That is only observable with TWO orgs commenting on the SAME global topic — which
 * is what this builds. A single-org suite would pass against an implementation that
 * showed every organization's comments to everyone, i.e. against the exact
 * cross-tenant channel the partition exists to prevent.
 */
import request from 'supertest';
import { DataSource } from 'typeorm';

import { Role } from '../src/common/enums/role.enum';
import { ModuleAccessService } from '../src/modules/module-access/module-access.service';
import {
  createTestApp,
  createTestOrg,
  destroyTestApp,
  getDataSource,
  registerUser,
  TestAppContext,
} from './utils/test-app';

jest.setTimeout(120_000);

describe('topics (e2e)', () => {
  let ctx: TestAppContext;
  let http: import('http').Server;
  let ds: DataSource;
  let access: ModuleAccessService;
  let orgA: string;
  let orgB: string;

  const id: Record<string, string> = {};
  let aStudent: string;
  let aProf: string;
  let bStudent: string;
  let bProf: string;
  let saCookie: string;

  let globalTopicId: string;
  let orgATopicId: string;

  const cast = async (email: string, role: Role, org: string | null): Promise<string> => {
    const user = await registerUser(ctx, { email, role, organizationId: org, firstName: 'Tp' });
    id[email] = user.id;
    return user.cookie;
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    http = ctx.app.getHttpServer();
    ds = getDataSource(ctx);
    access = ctx.app.get(ModuleAccessService);
    orgA = await createTestOrg(ds);
    orgB = await createTestOrg(ds);

    aStudent = await cast('tp-a-stu@codestack.dev', Role.STUDENT, orgA);
    aProf = await cast('tp-a-prof@codestack.dev', Role.PROFESSOR, orgA);
    bStudent = await cast('tp-b-stu@codestack.dev', Role.STUDENT, orgB);
    bProf = await cast('tp-b-prof@codestack.dev', Role.PROFESSOR, orgB);
    saCookie = await cast('tp-sa@codestack.dev', Role.SUPERADMIN, null);

    const g = await request(http)
      .post('/api/v1/topics')
      .set('Cookie', saCookie)
      .send({ title: 'Global: Dynamic Programming', description: 'Platform-wide', global: true });
    expect(g.status).toBe(201);
    expect(g.body.isGlobal).toBe(true);
    globalTopicId = g.body.id as string;

    const o = await request(http)
      .post('/api/v1/topics')
      .set('Cookie', aProf)
      .send({ title: 'Org A: Week 3', description: 'Org scoped' });
    expect(o.status).toBe(201);
    expect(o.body.isGlobal).toBe(false);
    orgATopicId = o.body.id as string;
  });

  afterAll(async () => {
    await destroyTestApp(ctx);
  });

  const comment = (cookie: string, topicId: string, body: string, extra: object = {}) =>
    request(http)
      .post(`/api/v1/topics/${topicId}/comments`)
      .set('Cookie', cookie)
      .send({ body, ...extra });

  describe('topic visibility', () => {
    it('shows a global topic to both tenants and an org topic to only one', async () => {
      const asA = await request(http).get('/api/v1/topics').set('Cookie', aStudent);
      const asB = await request(http).get('/api/v1/topics').set('Cookie', bStudent);
      expect(asA.status).toBe(200);
      expect(asB.status).toBe(200);

      const titles = (r: { body: { title: string }[] }) => r.body.map((t) => t.title);
      expect(titles(asA)).toContain('Global: Dynamic Programming');
      expect(titles(asB)).toContain('Global: Dynamic Programming');
      expect(titles(asA)).toContain('Org A: Week 3');
      expect(titles(asB)).not.toContain('Org A: Week 3');
    });

    it("404s org B on org A's topic by id", async () => {
      const res = await request(http).get(`/api/v1/topics/${orgATopicId}`).set('Cookie', bStudent);
      expect(res.status).toBe(404);
    });

    it('403s a STUDENT creating a topic', async () => {
      const res = await request(http)
        .post('/api/v1/topics')
        .set('Cookie', aStudent)
        .send({ title: 'Student topic' });
      expect(res.status).toBe(403);
    });

    it('403s a PROFESSOR asking for a global topic, rather than silently downgrading', async () => {
      const res = await request(http)
        .post('/api/v1/topics')
        .set('Cookie', aProf)
        .send({ title: 'Sneaky global', global: true });
      expect(res.status).toBe(403);
      expect(res.body.reason).toBe('global_topic_forbidden');
      // Nothing written — a downgraded org topic would be worse than the refusal,
      // because the author would believe they published platform-wide.
      const [row] = (await ds.query(`SELECT count(*)::int AS n FROM topics WHERE title = $1`, [
        'Sneaky global',
      ])) as { n: number }[];
      expect(row.n).toBe(0);
    });
  });

  describe('ORG PARTITIONING of a global topic', () => {
    it('keeps each tenant comments invisible to the other', async () => {
      expect((await comment(aStudent, globalTopicId, 'A: how do I memoise?')).status).toBe(201);
      expect((await comment(bStudent, globalTopicId, 'B: what is tabulation?')).status).toBe(201);

      const asA = await request(http)
        .get(`/api/v1/topics/${globalTopicId}/comments`)
        .set('Cookie', aStudent);
      const asB = await request(http)
        .get(`/api/v1/topics/${globalTopicId}/comments`)
        .set('Cookie', bStudent);

      const bodies = (r: { body: { body: string }[] }) => r.body.map((c) => c.body);
      expect(bodies(asA)).toEqual(['A: how do I memoise?']);
      expect(bodies(asB)).toEqual(['B: what is tabulation?']);
    });

    it('partitions for STAFF too — not just students', async () => {
      const asAProf = await request(http)
        .get(`/api/v1/topics/${globalTopicId}/comments`)
        .set('Cookie', aProf);
      const bodies: string[] = asAProf.body.map((c: { body: string }) => c.body);
      expect(bodies).toContain('A: how do I memoise?');
      expect(bodies).not.toContain('B: what is tabulation?');
    });

    it('stamps the COMMENT org even though the topic org is NULL', async () => {
      const [topic] = (await ds.query(`SELECT organization_id FROM topics WHERE id = $1`, [
        globalTopicId,
      ])) as { organization_id: string | null }[];
      expect(topic.organization_id).toBeNull(); // the topic really is global

      const rows = (await ds.query(
        `SELECT organization_id, body FROM topic_comments WHERE topic_id = $1 ORDER BY created_at`,
        [globalTopicId],
      )) as { organization_id: string; body: string }[];
      // Every comment carries a NON-NULL org — the author's — which is what the
      // partition is built on.
      expect(rows.map((r) => r.organization_id)).toEqual([orgA, orgB]);
    });

    it('counts comments within the reader own partition', async () => {
      const asA = await request(http).get('/api/v1/topics').set('Cookie', aStudent);
      const asB = await request(http).get('/api/v1/topics').set('Cookie', bStudent);
      const find = (r: { body: { id: string; commentCount: number }[] }) =>
        r.body.find((t) => t.id === globalTopicId)?.commentCount;
      // Two comments exist on the topic overall, one per org. Each side sees 1.
      expect(find(asA)).toBe(1);
      expect(find(asB)).toBe(1);
    });

    it('refuses a reply that would cross the partition', async () => {
      const bComments = await request(http)
        .get(`/api/v1/topics/${globalTopicId}/comments`)
        .set('Cookie', bStudent);
      const bCommentId = bComments.body[0].id as string;

      // Org A's student crafts a parentId pointing at org B's comment.
      const res = await comment(aStudent, globalTopicId, 'threading across tenants', {
        parentId: bCommentId,
      });
      expect(res.status).toBe(400);
      expect(res.body.reason).toBe('invalid_parent'); // opaque: same answer as "no such comment"
    });

    it('allows a reply inside the partition, one level deep only', async () => {
      const mine = await request(http)
        .get(`/api/v1/topics/${globalTopicId}/comments`)
        .set('Cookie', aStudent);
      const top = mine.body[0].id as string;

      const reply = await comment(aStudent, globalTopicId, 'a reply', { parentId: top });
      expect(reply.status).toBe(201);
      expect(reply.body.parentId).toBe(top);

      const nested = await comment(aStudent, globalTopicId, 'nested', {
        parentId: reply.body.id,
      });
      expect(nested.status).toBe(400);
      expect(nested.body.reason).toBe('nested_reply');
    });
  });

  describe('questions and resolution', () => {
    let questionId: string;

    it('fans a question out to the ASKER own org staff only', async () => {
      const res = await comment(aStudent, orgATopicId, 'Why is this O(n log n)?', {
        isQuestion: true,
      });
      expect(res.status).toBe(201);
      questionId = res.body.id as string;

      const notified = (
        (await ds.query(`SELECT user_id FROM notifications WHERE type = 'topic_doubt_raised'`)) as {
          user_id: string;
        }[]
      ).map((r) => r.user_id);

      expect(notified).toContain(id['tp-a-prof@codestack.dev']);
      expect(notified).not.toContain(id['tp-b-prof@codestack.dev']);
      expect(notified).not.toContain(id['tp-a-stu@codestack.dev']); // never the asker
    });

    it('a plain comment raises no notification', async () => {
      const before = (await ds.query(
        `SELECT count(*)::int AS n FROM notifications WHERE type = 'topic_doubt_raised'`,
      )) as { n: number }[];
      expect((await comment(aStudent, orgATopicId, 'just a remark')).status).toBe(201);
      const after = (await ds.query(
        `SELECT count(*)::int AS n FROM notifications WHERE type = 'topic_doubt_raised'`,
      )) as { n: number }[];
      expect(after[0].n).toBe(before[0].n);
    });

    it('lists the question in the staff doubts view, and 403s a student there', async () => {
      const staff = await request(http).get('/api/v1/topics/questions').set('Cookie', aProf);
      expect(staff.status).toBe(200);
      expect(staff.body.map((c: { id: string }) => c.id)).toContain(questionId);

      const asStudent = await request(http).get('/api/v1/topics/questions').set('Cookie', aStudent);
      expect(asStudent.status).toBe(403);
    });

    it("404s org B staff resolving org A's question", async () => {
      const res = await request(http)
        .patch(`/api/v1/topics/comments/${questionId}/resolve`)
        .set('Cookie', bProf)
        .send({});
      expect(res.status).toBe(404);
    });

    it('resolves once and notifies the asker', async () => {
      const res = await request(http)
        .patch(`/api/v1/topics/comments/${questionId}/resolve`)
        .set('Cookie', aProf)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.resolvedAt).not.toBeNull();
      expect(res.body.resolvedById).toBe(id['tp-a-prof@codestack.dev']);

      const notified = (
        (await ds.query(
          `SELECT user_id FROM notifications WHERE type = 'topic_doubt_resolved'`,
        )) as { user_id: string }[]
      ).map((r) => r.user_id);
      expect(notified).toContain(id['tp-a-stu@codestack.dev']);
    });

    it('the second resolve loses the race', async () => {
      const res = await request(http)
        .patch(`/api/v1/topics/comments/${questionId}/resolve`)
        .set('Cookie', aProf)
        .send({});
      expect(res.status).toBe(403);
      expect(res.body.reason).toBe('already_resolved');
    });

    it('400s resolving something that was never a question', async () => {
      const plain = await comment(aStudent, orgATopicId, 'not a question at all');
      const res = await request(http)
        .patch(`/api/v1/topics/comments/${plain.body.id}/resolve`)
        .set('Cookie', aProf)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.reason).toBe('not_a_question');
    });
  });

  describe('locking and deletion', () => {
    it('a locked topic refuses new comments but stays readable', async () => {
      const lock = await request(http)
        .patch(`/api/v1/topics/${orgATopicId}`)
        .set('Cookie', aProf)
        .send({ isLocked: true });
      expect(lock.status).toBe(200);

      const blocked = await comment(aStudent, orgATopicId, 'after the lock');
      expect(blocked.status).toBe(403);
      expect(blocked.body.reason).toBe('topic_locked');

      const read = await request(http)
        .get(`/api/v1/topics/${orgATopicId}/comments`)
        .set('Cookie', aStudent);
      expect(read.status).toBe(200);
      expect(read.body.length).toBeGreaterThan(0);

      await request(http)
        .patch(`/api/v1/topics/${orgATopicId}`)
        .set('Cookie', aProf)
        .send({ isLocked: false });
    });

    it('403s an org PROFESSOR editing a GLOBAL topic', async () => {
      const res = await request(http)
        .patch(`/api/v1/topics/${globalTopicId}`)
        .set('Cookie', aProf)
        .send({ title: 'hijacked' });
      expect(res.status).toBe(403);
      expect(res.body.reason).toBe('global_topic_forbidden');
    });

    it('lets an author delete their own comment, and takes replies with it', async () => {
      const parent = await comment(aStudent, orgATopicId, 'parent to delete');
      const child = await comment(aStudent, orgATopicId, 'child', {
        parentId: parent.body.id,
      });
      expect(child.status).toBe(201);

      const del = await request(http)
        .delete(`/api/v1/topics/comments/${parent.body.id}`)
        .set('Cookie', aStudent);
      expect(del.status).toBe(204);

      const [row] = (await ds.query(
        `SELECT count(*)::int AS n FROM topic_comments WHERE id = ANY($1::uuid[])`,
        [[parent.body.id, child.body.id]],
      )) as { n: number }[];
      expect(row.n).toBe(0); // the FK cascade removed the reply too
    });

    it("403s a student deleting somebody else's comment", async () => {
      const other = await cast('tp-a-stu2@codestack.dev', Role.STUDENT, orgA);
      const theirs = await comment(other, orgATopicId, 'not yours');
      const res = await request(http)
        .delete(`/api/v1/topics/comments/${theirs.body.id}`)
        .set('Cookie', aStudent);
      expect(res.status).toBe(403);
      expect(res.body.reason).toBe('not_your_comment');
    });
  });

  describe('entitlement', () => {
    const setFeature = async (key: string, role: Role, enabled: boolean): Promise<void> => {
      await ds.query(
        `DELETE FROM module_access WHERE module_key = $1 AND role = $2 AND org_id = $3`,
        [key, role, orgA],
      );
      await ds.query(
        `INSERT INTO module_access (module_key, role, enabled, org_id) VALUES ($1,$2,$3,$4)`,
        [key, role, enabled, orgA],
      );
      await access.invalidate(orgA);
    };

    it('topics.comment off blocks WRITING but not READING', async () => {
      await setFeature('topics.comment', Role.STUDENT, false);

      const write = await comment(aStudent, orgATopicId, 'should be blocked');
      expect(write.status).toBe(403);
      expect(write.body.reason).toBe('entitlement_required');

      // Reads carry no feature annotation on purpose: an org that turns commenting
      // off should end up with read-only threads, not invisible ones.
      const read = await request(http)
        .get(`/api/v1/topics/${orgATopicId}/comments`)
        .set('Cookie', aStudent);
      expect(read.status).toBe(200);

      await ds.query(
        `DELETE FROM module_access WHERE module_key = 'topics.comment' AND org_id = $1`,
        [orgA],
      );
      await access.invalidate(orgA);
    });

    it('topics.moderate off blocks the doubts view for a PROFESSOR', async () => {
      await setFeature('topics.moderate', Role.PROFESSOR, false);
      const res = await request(http).get('/api/v1/topics/questions').set('Cookie', aProf);
      expect(res.status).toBe(403);
      expect(res.body.feature).toBe('topics.moderate');

      await ds.query(
        `DELETE FROM module_access WHERE module_key = 'topics.moderate' AND org_id = $1`,
        [orgA],
      );
      await access.invalidate(orgA);
    });
  });
});
