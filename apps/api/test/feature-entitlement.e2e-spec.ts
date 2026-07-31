/**
 * E2E for the `@RequiresFeature` annotations added in #65.
 *
 * #64 shipped and unit-tested the mechanism; #65 attached it to real routes. The
 * only assertion that proves those annotations do anything is a request that
 * SUCCEEDS by default and then 403s once the feature is switched off for the
 * actor's org — a decorator on the wrong route, or on no route, passes every
 * other test in this repo.
 *
 * Two properties matter as much as the denial itself, and each has a test:
 *
 *  - The annotations are INERT by default. `FEATURE_DEFAULTS` is sparse and an
 *    absent cell resolves to `true`, so annotating a route must not change
 *    behaviour for an org that has configured nothing.
 *  - Turning a feature off must not reach the consumption surface. `problems.author`
 *    off still leaves `GET /problems` readable, because deny-by-default is NOT
 *    enabled for these router prefixes (see feature-gated-routers.ts).
 *
 * Every actor here is a PROFESSOR. `resolveFeature` short-circuits
 * `role === ADMIN` to `true` — org-admin immunity — so an ADMIN can never observe
 * an override and would make these tests pass regardless of the annotations.
 */
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource, Repository } from 'typeorm';

import { Role } from '../src/common/enums/role.enum';
import { ModuleAccessService } from '../src/modules/module-access/module-access.service';
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

describe('feature entitlement on annotated routes (e2e)', () => {
  let ctx: TestAppContext;
  let http: import('http').Server;
  let ds: DataSource;
  let access: ModuleAccessService;
  let orgId: string;
  let profCookie: string;

  /**
   * Writes an org-level override and drops the cached layer, the way the console's
   * `PATCH /module-access` does. Without the invalidate, `orgLayer` serves a
   * process-local cache and the new row is invisible.
   */
  const setFeature = async (key: string, role: Role, enabled: boolean): Promise<void> => {
    // Delete-then-insert rather than ON CONFLICT: the uniqueness is a PARTIAL index
    // (`uq_module_access_org ... WHERE org_id IS NOT NULL`), so conflict inference
    // would have to repeat that predicate to match it.
    await ds.query(
      `DELETE FROM module_access WHERE module_key = $1 AND role = $2 AND org_id = $3`,
      [key, role, orgId],
    );
    await ds.query(
      `INSERT INTO module_access (module_key, role, enabled, org_id) VALUES ($1, $2, $3, $4)`,
      [key, role, enabled, orgId],
    );
    await access.invalidate(orgId);
  };

  const clearFeature = async (key: string, role: Role): Promise<void> => {
    await ds.query(
      `DELETE FROM module_access WHERE module_key = $1 AND role = $2 AND org_id = $3`,
      [key, role, orgId],
    );
    await access.invalidate(orgId);
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    http = ctx.app.getHttpServer();
    ds = getDataSource(ctx);
    access = ctx.app.get(ModuleAccessService);
    orgId = await createTestOrg(ds);

    resetThrottleStorage(ctx);
    await request(http).post('/api/v1/auth/register').send({
      email: 'fe-prof@codestack.dev',
      password: 'Password1',
      firstName: 'Feature',
      lastName: 'Prof',
    });
    await ctx.app
      .get<Repository<User>>(getRepositoryToken(User))
      .update({ email: 'fe-prof@codestack.dev' }, { organizationId: orgId, role: Role.PROFESSOR });
    resetThrottleStorage(ctx);
    const login = await request(http)
      .post('/api/v1/auth/login')
      .send({ email: 'fe-prof@codestack.dev', password: 'Password1' });
    profCookie = extractAuthCookies(login.headers['set-cookie'] as unknown as string[]);
  });

  afterAll(async () => {
    await destroyTestApp(ctx);
  });

  // `body`, not `description` — CreateProblemDto names it `body`. The original
  // payload here was invalid, so the "inert by default" case was passing on a 400
  // rather than on a real create, and would have kept passing if the route were
  // deleted. Now it asserts 201.
  const createProblem = (title: string) =>
    request(http).post('/api/v1/problems').set('Cookie', profCookie).send({
      title,
      body: 'Solve it.',
      difficulty: 'easy',
      visibility: 'shared',
    });

  describe('problems.author on POST /problems', () => {
    it('is INERT by default — an unconfigured org authors as before', async () => {
      const res = await createProblem('fe-default-ok');
      expect(res.status).toBe(201);
    });

    it('403s entitlement_required once the feature is off for this role+org', async () => {
      await setFeature('problems.author', Role.PROFESSOR, false);
      const res = await createProblem('fe-denied');
      expect(res.status).toBe(403);
      expect(res.body.reason).toBe('entitlement_required');
      expect(res.body.feature).toBe('problems.author');
    });

    it('leaves the CONSUMPTION surface readable while authoring is off', async () => {
      // The prefix is deliberately NOT in FEATURE_GATED_ROUTER_PATHS, so
      // un-annotated reads stay allowed. If this ever 403s, someone added the
      // prefix without giving the student routes a key they can hold.
      const list = await request(http).get('/api/v1/problems').set('Cookie', profCookie);
      expect(list.status).toBe(200);
    });

    it('authoring works again the moment the override is removed', async () => {
      await clearFeature('problems.author', Role.PROFESSOR);
      const res = await createProblem('fe-restored');
      expect(res.status).toBe(201);
    });
  });

  describe('per-KIND entitlement, which no route decorator can express', () => {
    let assignmentId: string;

    beforeAll(async () => {
      // An assignment requires a classroom, and the classroom requires its
      // professor's id — the same fixture shape batches-and-items uses.
      const [prof] = (await ds.query(`SELECT id FROM users WHERE email = $1`, [
        'fe-prof@codestack.dev',
      ])) as { id: string }[];

      const classroom = await request(http)
        .post('/api/v1/classrooms')
        .set('Cookie', profCookie)
        .send({
          courseId: 'FE-101',
          title: 'Feature Entitlement E2E',
          startDate: '2020-01-01T00:00:00Z',
          endDate: '2030-01-01T00:00:00Z',
          professorId: prof.id,
          studentIds: [],
        });
      expect(classroom.status).toBe(201);

      const res = await request(http).post('/api/v1/assignments').set('Cookie', profCookie).send({
        title: 'FE Assignment',
        startDate: '2020-01-01T00:00:00Z',
        endDate: '2030-01-01T00:00:00Z',
        classroomId: classroom.body.id,
        asDraft: true,
      });
      expect(res.status).toBe(201);
      assignmentId = res.body.id as string;
    });

    const createItem = (kind: string) =>
      request(http)
        .post(`/api/v1/assignments/${assignmentId}/items`)
        .set('Cookie', profCookie)
        .send(
          kind === 'mcq'
            ? {
                kind: 'mcq',
                prompt: 'pick',
                maxPoints: 1,
                allowMultiple: false,
                options: [
                  { text: 'a', isCorrect: true },
                  { text: 'b', isCorrect: false },
                ],
              }
            : { kind: 'quiz', prompt: 'explain', maxPoints: 1 },
        );

    it('authors an MCQ item by default', async () => {
      const res = await createItem('mcq');
      expect(res.status).toBe(201);
    });

    it('403s only the MCQ kind when assignments.mcq-crud is off', async () => {
      await setFeature('assignments.mcq-crud', Role.PROFESSOR, false);

      const mcq = await createItem('mcq');
      expect(mcq.status).toBe(403);
      expect(mcq.body.reason).toBe('entitlement_required');
      expect(mcq.body.feature).toBe('assignments.mcq-crud');

      // The decisive assertion: SAME route, SAME actor, different body kind —
      // still allowed. A route-level @RequiresFeature would have denied both, which
      // is exactly why this gate lives in the service.
      const quiz = await createItem('quiz');
      expect(quiz.status).toBe(201);

      await clearFeature('assignments.mcq-crud', Role.PROFESSOR);
    });

    it('403s the assignment authoring route itself when assignments.author is off', async () => {
      await setFeature('assignments.author', Role.PROFESSOR, false);
      const res = await request(http)
        .patch(`/api/v1/assignments/${assignmentId}`)
        .set('Cookie', profCookie)
        .send({ title: 'renamed' });
      expect(res.status).toBe(403);
      expect(res.body.feature).toBe('assignments.author');
      await clearFeature('assignments.author', Role.PROFESSOR);
    });
  });
});
