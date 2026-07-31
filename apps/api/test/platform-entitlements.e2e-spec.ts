/**
 * E2E for the SuperAdmin org-scoped entitlement + quota surface (#70).
 *
 * These routes are the only ones in the app that take an organization id from the
 * client, so the tests that matter most are the ones proving the gate holds and that
 * the org named in the path is the org actually written.
 *
 * The other load-bearing property is `null` vs `0` on a quota limit: `null` means
 * UNLIMITED and `0` means BLOCKED, they are not interchangeable, and a surface that
 * conflates them turns an uncapped org into a fully blocked one. That distinction is
 * asserted on the response AND on the row.
 */
import { getRepositoryToken } from '@nestjs/typeorm';
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

interface Cell {
  moduleKey: string;
  role: Role;
  enabled: boolean;
  locked: boolean;
}

describe('platform entitlements + quotas (e2e)', () => {
  let ctx: TestAppContext;
  let http: import('http').Server;
  let ds: DataSource;
  let orgA: string;
  let orgB: string;
  let saCookie: string;
  let adminCookie: string;

  const cast = async (email: string, role: Role, org: string | null): Promise<string> => {
    resetThrottleStorage(ctx);
    const reg = await request(http)
      .post('/api/v1/auth/register')
      .send({ email, password: 'Password1', firstName: 'Pe', lastName: 'User' });
    expect(reg.status).toBe(201);
    await ctx.app
      .get<Repository<User>>(getRepositoryToken(User))
      .update({ email }, { organizationId: org, role });
    resetThrottleStorage(ctx);
    const login = await request(http)
      .post('/api/v1/auth/login')
      .send({ email, password: 'Password1' });
    expect(login.status).toBe(200);
    return extractAuthCookies(login.headers['set-cookie'] as unknown as string[]);
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    http = ctx.app.getHttpServer();
    ds = getDataSource(ctx);
    orgA = await createTestOrg(ds);
    orgB = await createTestOrg(ds);
    saCookie = await cast('pe-sa@codestack.dev', Role.SUPERADMIN, null);
    adminCookie = await cast('pe-admin@codestack.dev', Role.ADMIN, orgA);
  });

  afterAll(async () => {
    await destroyTestApp(ctx);
  });

  describe('the @Platform gate', () => {
    it('403s an org ADMIN on every route, including for their OWN org', async () => {
      const paths: [string, 'get' | 'patch'][] = [
        [`/api/v1/platform/organizations/${orgA}/module-access`, 'get'],
        [`/api/v1/platform/organizations/${orgA}/module-access`, 'patch'],
        [`/api/v1/platform/organizations/${orgA}/quotas`, 'get'],
        [`/api/v1/platform/organizations/${orgA}/quotas`, 'patch'],
      ];
      for (const [path, method] of paths) {
        const res = await request(http)[method](path).set('Cookie', adminCookie).send({});
        expect(res.status).toBe(403);
      }
    });

    it('404s the SuperAdmin on an unknown org before writing anything', async () => {
      const ghost = '00000000-0000-4000-8000-000000000000';
      const res = await request(http)
        .patch(`/api/v1/platform/organizations/${ghost}/quotas`)
        .set('Cookie', saCookie)
        .send({ resource: 'max_users', limitValue: 5 });
      expect(res.status).toBe(404);
      // The org check must precede setLimit, or a quota row lands against a
      // non-existent tenant.
      const [row] = (await ds.query(
        `SELECT count(*)::int AS n FROM org_quotas WHERE organization_id = $1`,
        [ghost],
      )) as { n: number }[];
      expect(row.n).toBe(0);
    });
  });

  describe('the matrix', () => {
    it('returns modules AND features, with the key lists to split them', async () => {
      const res = await request(http)
        .get(`/api/v1/platform/organizations/${orgA}/module-access`)
        .set('Cookie', saCookie);
      expect(res.status).toBe(200);

      expect(res.body.toggleable).toContain('problems');
      expect(res.body.features).toContain('problems.author');
      expect(res.body.system).toContain('dashboard');

      const keys: string[] = res.body.matrix.map((c: Cell) => c.moduleKey);
      // One array carries both kinds, which is why the client needs the key lists
      // rather than looking for a dot.
      expect(keys).toContain('problems');
      expect(keys).toContain('problems.author');
      // SYSTEM modules are structural and never in the matrix.
      expect(keys).not.toContain('dashboard');
    });

    it('marks ceiling-forbidden and admin cells as locked, not merely off', async () => {
      const res = await request(http)
        .get(`/api/v1/platform/organizations/${orgA}/module-access`)
        .set('Cookie', saCookie);
      const cells: Cell[] = res.body.matrix;

      // A student can never author problems — the ceiling owns it.
      const studentAuthor = cells.find(
        (c) => c.moduleKey === 'problems.author' && c.role === Role.STUDENT,
      );
      expect(studentAuthor).toMatchObject({ locked: true, enabled: false });

      // Every ADMIN cell is locked by immunity: no override at this layer moves it.
      expect(cells.filter((c) => c.role === Role.ADMIN).every((c) => c.locked)).toBe(true);
    });

    it('writes the cell into the org NAMED IN THE PATH, and not the other org', async () => {
      const patch = await request(http)
        .patch(`/api/v1/platform/organizations/${orgA}/module-access`)
        .set('Cookie', saCookie)
        .send({ key: 'problems.author', role: 'professor', enabled: false });
      expect(patch.status).toBe(200);

      const cell = (patch.body.matrix as Cell[]).find(
        (c) => c.moduleKey === 'problems.author' && c.role === Role.PROFESSOR,
      );
      expect(cell?.enabled).toBe(false);

      // The row landed in org A only.
      const rows = (await ds.query(
        `SELECT org_id FROM module_access WHERE module_key = 'problems.author' AND role = 'professor'`,
      )) as { org_id: string | null }[];
      expect(rows.map((r) => r.org_id)).toEqual([orgA]);

      // And org B is untouched — still enabled.
      const bMatrix = await request(http)
        .get(`/api/v1/platform/organizations/${orgB}/module-access`)
        .set('Cookie', saCookie);
      const bCell = (bMatrix.body.matrix as Cell[]).find(
        (c) => c.moduleKey === 'problems.author' && c.role === Role.PROFESSOR,
      );
      expect(bCell?.enabled).toBe(true);
    });

    it('400s a cell the role ceiling forbids, rather than storing a no-op row', async () => {
      const res = await request(http)
        .patch(`/api/v1/platform/organizations/${orgA}/module-access`)
        .set('Cookie', saCookie)
        .send({ key: 'problems.author', role: 'student', enabled: true });
      expect(res.status).toBe(400);
    });

    it('400s an unknown key', async () => {
      const res = await request(http)
        .patch(`/api/v1/platform/organizations/${orgA}/module-access`)
        .set('Cookie', saCookie)
        .send({ key: 'not.a.real.key', role: 'professor', enabled: true });
      expect(res.status).toBe(400);
    });
  });

  describe('quotas — null is UNLIMITED, 0 is BLOCKED', () => {
    const setQuota = (org: string, resource: string, limitValue: number | null) =>
      request(http)
        .patch(`/api/v1/platform/organizations/${org}/quotas`)
        .set('Cookie', saCookie)
        .send({ resource, limitValue });

    it('reports an unconfigured resource as unlimited (limit null)', async () => {
      const res = await request(http)
        .get(`/api/v1/platform/organizations/${orgA}/quotas`)
        .set('Cookie', saCookie);
      expect(res.status).toBe(200);
      expect(res.body.usage.max_users.limit).toBeNull();
      expect(res.body.usage.max_users.remaining).toBeNull();
      expect(res.body.usage.max_users.exceeded).toBe(false);
    });

    it('stores 0 as a real BLOCKING limit, never as absent', async () => {
      const res = await setQuota(orgA, 'max_problems', 0);
      expect(res.status).toBe(200);
      expect(res.body.usage.max_problems.limit).toBe(0);
      expect(res.body.usage.max_problems.remaining).toBe(0);

      const [row] = (await ds.query(
        `SELECT limit_value FROM org_quotas WHERE organization_id = $1 AND resource = 'max_problems'`,
        [orgA],
      )) as { limit_value: number | null }[];
      expect(row.limit_value).toBe(0); // 0, not NULL — the distinction survives the round trip
    });

    it('clears back to unlimited with an EXPLICIT null', async () => {
      const res = await setQuota(orgA, 'max_problems', null);
      expect(res.status).toBe(200);
      expect(res.body.usage.max_problems.limit).toBeNull();

      const [row] = (await ds.query(
        `SELECT limit_value FROM org_quotas WHERE organization_id = $1 AND resource = 'max_problems'`,
        [orgA],
      )) as { limit_value: number | null }[];
      expect(row.limit_value).toBeNull();
    });

    it('400s an OMITTED limitValue instead of guessing which one was meant', async () => {
      const res = await request(http)
        .patch(`/api/v1/platform/organizations/${orgA}/quotas`)
        .set('Cookie', saCookie)
        .send({ resource: 'max_users' });
      expect(res.status).toBe(400);
    });

    it('400s a negative or fractional limit', async () => {
      expect((await setQuota(orgA, 'max_users', -1)).status).toBe(400);
      expect((await setQuota(orgA, 'max_users', 1.5)).status).toBe(400);
    });

    it('is idempotent and updates in place rather than adding rows', async () => {
      await setQuota(orgB, 'max_users', 10);
      await setQuota(orgB, 'max_users', 25);
      const [row] = (await ds.query(
        `SELECT count(*)::int AS n FROM org_quotas WHERE organization_id = $1 AND resource = 'max_users'`,
        [orgB],
      )) as { n: number }[];
      expect(row.n).toBe(1);

      const res = await request(http)
        .get(`/api/v1/platform/organizations/${orgB}/quotas`)
        .set('Cookie', saCookie);
      expect(res.body.usage.max_users.limit).toBe(25);
    });

    it('narrows the catalog by scope WITHOUT widening what is visible', async () => {
      // Two problems: one global (SuperAdmin), one owned by org B.
      const g = await request(http).post('/api/v1/problems').set('Cookie', saCookie).send({
        title: 'PE Global Problem',
        body: 'x',
        difficulty: 'easy',
        scope: 'global',
        visibility: 'shared',
      });
      expect(g.status).toBe(201);

      const bProf = await cast('pe-b-prof@codestack.dev', Role.PROFESSOR, orgB);
      const o = await request(http).post('/api/v1/problems').set('Cookie', bProf).send({
        title: 'PE Org B Problem',
        body: 'x',
        difficulty: 'easy',
        visibility: 'shared',
      });
      expect(o.status).toBe(201);

      // scope=global as the SuperAdmin: the global catalog only.
      const globals = await request(http)
        .get('/api/v1/problems?scope=global&limit=100')
        .set('Cookie', saCookie);
      const titles: string[] = globals.body.data.map((p: { title: string }) => p.title);
      expect(titles).toContain('PE Global Problem');
      expect(titles).not.toContain('PE Org B Problem');

      // The decisive one: scope is a FILTER, not a grant. Org A's admin asking for
      // scope=org must still not see org B's problem — the visibility predicate runs
      // first and the filter can only narrow what it left.
      const asA = await request(http)
        .get('/api/v1/problems?scope=org&limit=100')
        .set('Cookie', adminCookie);
      const aTitles: string[] = asA.body.data.map((p: { title: string }) => p.title);
      expect(aTitles).not.toContain('PE Org B Problem');
      expect(aTitles).not.toContain('PE Global Problem'); // filtered out by scope=org
    });

    it('reports exceeded when a limit is lowered below current usage', async () => {
      // orgA has one member (the admin), so a limit of 0 is already exceeded.
      const res = await setQuota(orgA, 'max_users', 0);
      expect(res.body.usage.max_users.limit).toBe(0);
      expect(res.body.usage.max_users.used).toBeGreaterThan(0);
      expect(res.body.usage.max_users.exceeded).toBe(true);
      // remaining floors at 0 rather than going negative.
      expect(res.body.usage.max_users.remaining).toBe(0);

      await setQuota(orgA, 'max_users', null); // leave the fixture uncapped
    });
  });
});
