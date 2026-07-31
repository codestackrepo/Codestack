/**
 * E2E coverage for the assignment-model epic (#17–#20): batches + assignment
 * targeting (3-site student filter, delete-409, removeStudent purge) and mixed
 * items (staff sees isCorrect; student take never leaks isCorrect/scores; MCQ
 * auto-score is hidden).
 *
 * NOTE: like the rest of the e2e suite this boots Postgres + Redis testcontainers
 * and therefore requires Docker. It was authored against the real schema/DTOs and
 * type-checks, but has NOT been executed in the authoring environment (Docker was
 * unavailable) — run `pnpm --filter @codestack/api test:e2e` to verify.
 */
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

jest.setTimeout(120_000);

interface Registered {
  id: string;
  cookie: string;
}

describe('batches + targeting + items (e2e)', () => {
  let ctx: TestAppContext;
  let http: import('http').Server;
  let ds: import('typeorm').DataSource;
  let orgId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    http = ctx.app.getHttpServer();
    ds = getDataSource(ctx);
    orgId = await createTestOrg(ds);
  });

  afterAll(async () => {
    await destroyTestApp(ctx);
  });

  let seq = 0;
  /**
   * Registers through the real endpoint, then stamps the tenant (and role) and
   * re-authenticates so the issued JWT carries both.
   *
   * The tenant stamp is unconditional, not just for staff. `POST /auth/register`
   * writes `organization_id = NULL` — legal for a STUDENT since 1785520000000, but
   * `TenantContextGuard` 403s `no_organization` on every non-`@Public` route, and
   * `chk_users_org_required` rejects an org-less PROFESSOR (23514). Everyone shares
   * one org so the classroom/batch pickers are never a cross-org reference.
   */
  const register = async (role: Role = Role.STUDENT): Promise<Registered> => {
    resetThrottleStorage(ctx);
    const email = `bt${seq++}.e2e@codestack.dev`;
    const reg = await request(http)
      .post('/api/v1/auth/register')
      .send({ email, password: 'Password1', firstName: 'BT', lastName: `U${seq}` });
    const id: string = reg.body.user.id;

    const userRepo = ctx.app.get<Repository<User>>(getRepositoryToken(User));
    await userRepo.update({ id }, { organizationId: orgId, role });
    const login = await request(http)
      .post('/api/v1/auth/login')
      .send({ email, password: 'Password1' });
    return { id, cookie: extractAuthCookies(login.headers['set-cookie'] as unknown as string[]) };
  };

  describe('batch targeting: 3-site student visibility', () => {
    let prof: Registered;
    let studentA: Registered;
    let studentB: Registered;
    let classroomId: string;
    let batchId: string;
    let assignmentId: string;

    beforeAll(async () => {
      prof = await register(Role.PROFESSOR);
      studentA = await register();
      studentB = await register();

      const classroom = await request(http)
        .post('/api/v1/classrooms')
        .set('Cookie', prof.cookie)
        .send({
          courseId: 'BT-101',
          title: 'Batch Targeting E2E',
          startDate: '2020-01-01T00:00:00Z',
          endDate: '2030-01-01T00:00:00Z',
          professorId: prof.id,
          studentIds: [studentA.id, studentB.id],
        });
      classroomId = classroom.body.id;

      const batch = await request(http)
        .post(`/api/v1/classrooms/${classroomId}/batches`)
        .set('Cookie', prof.cookie)
        .send({ name: 'Section A', studentIds: [studentA.id] });
      batchId = batch.body.id;
    });

    it('rejects adding a non-member student to a batch (subset invariant → 400)', async () => {
      const outsider = await register();
      const res = await request(http)
        .post(`/api/v1/classrooms/${classroomId}/batches/${batchId}/students`)
        .set('Cookie', prof.cookie)
        .send({ studentIds: [outsider.id] });
      expect(res.status).toBe(400);
    });

    it('forbids a plain student from creating a batch (403)', async () => {
      const res = await request(http)
        .post(`/api/v1/classrooms/${classroomId}/batches`)
        .set('Cookie', studentA.cookie)
        .send({ name: 'Rogue' });
      expect(res.status).toBe(403);
    });

    it('publishes a batch-targeted assignment visible to A but not B (site #1 findAll)', async () => {
      const created = await request(http)
        .post('/api/v1/assignments')
        .set('Cookie', prof.cookie)
        .send({
          title: 'Batch-only assignment',
          startDate: '2020-01-01T00:00:00Z',
          endDate: '2030-01-01T00:00:00Z',
          classroomId,
          asDraft: true,
          targetType: 'batch',
          targetBatchIds: [batchId],
        });
      expect(created.status).toBe(201);
      assignmentId = created.body.id;
      expect(created.body.targetType).toBe('batch');
      expect(created.body.targetBatchIds).toEqual([batchId]);

      const publish = await request(http)
        .post(`/api/v1/assignments/${assignmentId}/publish`)
        .set('Cookie', prof.cookie);
      expect(publish.status).toBe(200);

      const listA = await request(http).get('/api/v1/assignments').set('Cookie', studentA.cookie);
      const listB = await request(http).get('/api/v1/assignments').set('Cookie', studentB.cookie);
      const idsA = (listA.body.data as Array<{ id: string }>).map((a) => a.id);
      const idsB = (listB.body.data as Array<{ id: string }>).map((a) => a.id);
      expect(idsA).toContain(assignmentId);
      expect(idsB).not.toContain(assignmentId);
    });

    it('denies B direct access to the batch-targeted assignment (site #3 assertCanView → 403)', async () => {
      const resA = await request(http)
        .get(`/api/v1/assignments/${assignmentId}`)
        .set('Cookie', studentA.cookie);
      expect(resA.status).toBe(200);
      const resB = await request(http)
        .get(`/api/v1/assignments/${assignmentId}`)
        .set('Cookie', studentB.cookie);
      expect(resB.status).toBe(403);
    });

    it('shows the batch-targeted deadline to A but not B (site #2 deadlines)', async () => {
      const dlA = await request(http)
        .get('/api/v1/assignments/deadlines')
        .set('Cookie', studentA.cookie);
      const dlB = await request(http)
        .get('/api/v1/assignments/deadlines')
        .set('Cookie', studentB.cookie);
      expect((dlA.body as Array<{ id: string }>).map((a) => a.id)).toContain(assignmentId);
      expect((dlB.body as Array<{ id: string }>).map((a) => a.id)).not.toContain(assignmentId);
    });

    it('refuses to delete a batch referenced by an assignment target (409)', async () => {
      const res = await request(http)
        .delete(`/api/v1/classrooms/${classroomId}/batches/${batchId}`)
        .set('Cookie', prof.cookie);
      expect(res.status).toBe(409);
    });

    it('purges batch membership when a student is removed from the classroom', async () => {
      // Fresh batch with A so we can remove A from the classroom and assert the purge.
      const b2 = await request(http)
        .post(`/api/v1/classrooms/${classroomId}/batches`)
        .set('Cookie', prof.cookie)
        .send({ name: 'Section Purge', studentIds: [studentA.id] });
      const b2Id: string = b2.body.id;

      await request(http)
        .delete(`/api/v1/classrooms/${classroomId}/students/${studentA.id}`)
        .set('Cookie', prof.cookie);

      const after = await request(http)
        .get(`/api/v1/classrooms/${classroomId}/batches/${b2Id}`)
        .set('Cookie', prof.cookie);
      expect((after.body.students as Array<{ id: string }>).map((s) => s.id)).not.toContain(
        studentA.id,
      );
    });
  });

  describe('mixed items: staff sees isCorrect, student take never does', () => {
    let prof: Registered;
    let student: Registered;
    let assignmentId: string;
    let mcqItemId: string;

    beforeAll(async () => {
      prof = await register(Role.PROFESSOR);
      student = await register();

      const classroom = await request(http)
        .post('/api/v1/classrooms')
        .set('Cookie', prof.cookie)
        .send({
          courseId: 'BT-201',
          title: 'Items E2E',
          startDate: '2020-01-01T00:00:00Z',
          endDate: '2030-01-01T00:00:00Z',
          professorId: prof.id,
          studentIds: [student.id],
        });
      const classroomId: string = classroom.body.id;

      const assignment = await request(http)
        .post('/api/v1/assignments')
        .set('Cookie', prof.cookie)
        .send({
          title: 'Items assignment',
          startDate: '2020-01-01T00:00:00Z',
          endDate: '2030-01-01T00:00:00Z',
          classroomId,
        });
      assignmentId = assignment.body.id;
      // SCHEDULED -> ACTIVE (start is in the past).
      await request(http).get(`/api/v1/assignments/${assignmentId}`).set('Cookie', prof.cookie);

      const mcq = await request(http)
        .post(`/api/v1/assignments/${assignmentId}/items`)
        .set('Cookie', prof.cookie)
        .send({
          kind: 'mcq',
          prompt: '2 + 2 = ?',
          maxPoints: 5,
          allowMultiple: false,
          options: [
            { text: '4', isCorrect: true },
            { text: '5', isCorrect: false },
          ],
        });
      mcqItemId = mcq.body.id;
    });

    it('staff item listing includes isCorrect on options', async () => {
      const res = await request(http)
        .get(`/api/v1/assignments/${assignmentId}/items`)
        .set('Cookie', prof.cookie);
      expect(res.status).toBe(200);
      const item = (
        res.body as Array<{ id: string; options?: Array<Record<string, unknown>> }>
      ).find((i) => i.id === mcqItemId);
      expect(item?.options?.every((o) => 'isCorrect' in o)).toBe(true);
    });

    it('rejects an MCQ create with fewer than 2 options (400)', async () => {
      const res = await request(http)
        .post(`/api/v1/assignments/${assignmentId}/items`)
        .set('Cookie', prof.cookie)
        .send({ kind: 'mcq', options: [{ text: 'only', isCorrect: true }] });
      expect(res.status).toBe(400);
    });

    it('student take strips isCorrect and any score from every option', async () => {
      const res = await request(http)
        .get(`/api/v1/assignments/${assignmentId}/take`)
        .set('Cookie', student.cookie);
      expect(res.status).toBe(200);
      const raw = JSON.stringify(res.body);
      expect(raw).not.toContain('isCorrect');
      expect(raw).not.toContain('awardedPoints');
      const item = (
        res.body.items as Array<{ itemId: string; options?: Array<Record<string, unknown>> }>
      ).find((i) => i.itemId === mcqItemId);
      expect(item?.options?.every((o) => !('isCorrect' in o))).toBe(true);
    });

    it('exposes SAMPLE cases and the statement, and never a HIDDEN case (#46)', async () => {
      // This suite's fixture has no coding item, so build one here. Without it the
      // test would find nothing to assert on and pass vacuously — which is worse
      // than no test, because it reads as coverage.
      const problem = await request(http).post('/api/v1/problems').set('Cookie', prof.cookie).send({
        title: 'Take Drilldown Problem',
        body: 'Add two numbers and print the sum.',
        difficulty: 'easy',
        visibility: 'shared',
      });
      expect(problem.status).toBe(201);

      await ds.query(
        `INSERT INTO test_cases (problem_id, input_data, expected_output, explanation, type, order_index, is_active)
           VALUES ($1,'2 3','5','two plus three','sample',0,true),
                  ($1,'SECRET_HIDDEN_INPUT','SECRET_HIDDEN_OUTPUT','','hidden',1,true)`,
        [problem.body.id],
      );

      const created = await request(http)
        .post(`/api/v1/assignments/${assignmentId}/items`)
        .set('Cookie', prof.cookie)
        .send({
          kind: 'coding',
          sourceProblemId: problem.body.id,
          score: 10,
          languages: ['python'],
        });
      expect(created.status).toBe(201);

      const res = await request(http)
        .get(`/api/v1/assignments/${assignmentId}/take`)
        .set('Cookie', student.cookie);
      expect(res.status).toBe(200);

      const item = (
        res.body.items as Array<{
          kind: string;
          statement?: string;
          languages?: string[];
          sampleTestCases?: { inputData: string; expectedOutput: string }[];
        }>
      ).find((i) => i.kind === 'coding');
      // Fail loudly if the coding item is absent rather than skipping the assertions.
      expect(item).toBeDefined();

      expect(item?.statement).toContain('Add two numbers');
      expect(item?.languages).toContain('python');
      expect(item?.sampleTestCases).toHaveLength(1);
      expect(item?.sampleTestCases?.[0].inputData).toBe('2 3');

      // The load-bearing half. Asserted on the RAW payload so it holds however the
      // DTO is reshaped later: a hidden case must never reach a student, or the
      // problem can be solved by printing the expected output.
      const raw = JSON.stringify(res.body);
      expect(raw).toContain('two plus three');
      expect(raw).not.toContain('SECRET_HIDDEN_INPUT');
      expect(raw).not.toContain('SECRET_HIDDEN_OUTPUT');
    });

    it('saving an MCQ response returns no score/correctness to the student', async () => {
      // Discover the correct option id from the staff view.
      const staff = await request(http)
        .get(`/api/v1/assignments/${assignmentId}/items`)
        .set('Cookie', prof.cookie);
      const staffItem = (
        staff.body as Array<{ id: string; options: Array<{ id: string; isCorrect: boolean }> }>
      ).find((i) => i.id === mcqItemId);
      const correctId = staffItem?.options.find((o) => o.isCorrect)?.id as string;

      const res = await request(http)
        .put(`/api/v1/assignments/items/${mcqItemId}/mcq`)
        .set('Cookie', student.cookie)
        .send({ selectedOptionIds: [correctId] });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ saved: true });
      expect(JSON.stringify(res.body)).not.toContain('awardedPoints');
    });

    it('forbids a non-member student from the take endpoint (403)', async () => {
      const outsider = await register();
      const res = await request(http)
        .get(`/api/v1/assignments/${assignmentId}/take`)
        .set('Cookie', outsider.cookie);
      expect(res.status).toBe(403);
    });
  });
});
