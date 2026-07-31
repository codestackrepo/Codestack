/**
 * E2E for cross-tenant isolation and privilege escalation — the last spec named
 * in #109's verification section, and the only one that builds TWO organizations.
 *
 * Why that matters: every other suite in this directory creates exactly one org,
 * so `scopeToOrg` and `assertSameOrg` have never actually been exercised with a
 * second tenant's rows present in the tables. A predicate that silently matched
 * everything would pass all of them. Here org A and org B both hold a full cast,
 * so a missing `WHERE organization_id = ...` shows up as a leaked row rather than
 * as an empty list that looks correct.
 *
 * This automates section H of the epic's manual click-through, plus the DB-level
 * escalation invariant, which no spec covered.
 *
 * The isolation assertions are written to fail LOUDLY on a leak: they assert on
 * the presence of a specific foreign email, not just on a count, because a count
 * assertion passes for the wrong reason as soon as a fixture changes.
 */
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource, QueryFailedError, Repository } from 'typeorm';

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

const A_ADMIN = 'ti-a-admin@codestack.dev';
const A_STUDENT = 'ti-a-student@codestack.dev';
const B_ADMIN = 'ti-b-admin@codestack.dev';
const B_PROF = 'ti-b-prof@codestack.dev';
const B_STUDENT = 'ti-b-student@codestack.dev';
const LOOSE = 'ti-loose@codestack.dev';

describe('tenancy isolation + escalation (e2e)', () => {
  let ctx: TestAppContext;
  let http: import('http').Server;
  let ds: DataSource;
  let repo: Repository<User>;

  let orgA: string;
  let orgB: string;

  const id: Record<string, string> = {};
  let aAdmin: string;
  let bAdmin: string;
  let bProf: string;
  let saCookie: string;

  const register = async (email: string): Promise<string> => {
    resetThrottleStorage(ctx);
    const res = await request(http)
      .post('/api/v1/auth/register')
      .send({ email, password: 'Password1', firstName: 'Ti', lastName: 'User' });
    expect(res.status).toBe(201);
    return res.body.user.id as string;
  };

  /** Registers, stamps role + org directly, then signs in for a fresh cookie. */
  const cast = async (email: string, role: Role, org: string | null): Promise<string> => {
    id[email] = await register(email);
    await repo.update({ email }, { organizationId: org, role });
    resetThrottleStorage(ctx);
    const login = await request(http).post('/api/v1/auth/login').send({
      email,
      password: 'Password1',
    });
    expect(login.status).toBe(200);
    return extractAuthCookies(login.headers['set-cookie'] as unknown as string[]);
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    http = ctx.app.getHttpServer();
    ds = getDataSource(ctx);
    repo = ctx.app.get<Repository<User>>(getRepositoryToken(User));

    orgA = await createTestOrg(ds);
    orgB = await createTestOrg(ds);

    aAdmin = await cast(A_ADMIN, Role.ADMIN, orgA);
    await cast(A_STUDENT, Role.STUDENT, orgA);
    bAdmin = await cast(B_ADMIN, Role.ADMIN, orgB);
    bProf = await cast(B_PROF, Role.PROFESSOR, orgB);
    await cast(B_STUDENT, Role.STUDENT, orgB);
    // Legal only because 1785520000000 relaxed the CHECK for students.
    await cast(LOOSE, Role.STUDENT, null);
    saCookie = await cast('ti-sa@codestack.dev', Role.SUPERADMIN, null);
  });

  afterAll(async () => {
    await destroyTestApp(ctx);
  });

  describe('reads are bounded to the actor org', () => {
    it("GET /users omits every one of the other tenant's members", async () => {
      const res = await request(http).get('/api/v1/users?limit=100').set('Cookie', bAdmin);
      expect(res.status).toBe(200);

      const emails: string[] = res.body.data.map((u: { email: string }) => u.email);
      // The positive half: B's admin must still see B.
      expect(emails).toContain(B_STUDENT);
      // The isolation half, named explicitly rather than counted.
      expect(emails).not.toContain(A_ADMIN);
      expect(emails).not.toContain(A_STUDENT);
      // Org-less students are not in ANY tenant's list — they are only in the pool.
      expect(emails).not.toContain(LOOSE);
    });

    it('GET /users/search cannot reach across the boundary either', async () => {
      // Same surname on every fixture, so a leaking predicate returns both orgs.
      const res = await request(http).get('/api/v1/users/search?q=ti-').set('Cookie', bAdmin);
      expect(res.status).toBe(200);
      const emails: string[] = res.body.map((u: { email: string }) => u.email);
      expect(emails.some((e) => e.startsWith('ti-a-'))).toBe(false);
    });

    it("GET /users/:id 403s on another tenant's user (IDOR)", async () => {
      const res = await request(http).get(`/api/v1/users/${id[A_STUDENT]}`).set('Cookie', bAdmin);
      expect(res.status).toBe(403);
    });

    it('the SUPERADMIN, by contrast, sees both tenants at once', async () => {
      const res = await request(http).get('/api/v1/users?limit=100').set('Cookie', saCookie);
      expect(res.status).toBe(200);
      const emails: string[] = res.body.data.map((u: { email: string }) => u.email);
      expect(emails).toContain(A_ADMIN);
      expect(emails).toContain(B_ADMIN);
    });
  });

  describe('writes reject a cross-org target', () => {
    it("PATCH /users/:id 403s cross_org on the other tenant's student", async () => {
      const res = await request(http)
        .patch(`/api/v1/users/${id[A_STUDENT]}`)
        .set('Cookie', bAdmin)
        .send({ firstName: 'Owned' });
      expect(res.status).toBe(403);

      // The row is what actually matters — a 403 with a mutated row would be the
      // worst outcome, and only a direct read can rule it out.
      const row = await repo.findOne({ where: { id: id[A_STUDENT] } });
      expect(row?.firstName).toBe('Ti');
    });

    it('DELETE /users/:id 403s across the boundary', async () => {
      const res = await request(http)
        .delete(`/api/v1/users/${id[A_STUDENT]}`)
        .set('Cookie', bAdmin);
      expect(res.status).toBe(403);
      expect(await repo.findOne({ where: { id: id[A_STUDENT] } })).not.toBeNull();
    });

    it('the access toggle 403s across the boundary, leaving isActive untouched', async () => {
      const res = await request(http)
        .patch(`/api/v1/users/${id[A_STUDENT]}`)
        .set('Cookie', bAdmin)
        .send({ isActive: false });
      expect(res.status).toBe(403);

      const row = await repo.findOne({ where: { id: id[A_STUDENT] } });
      expect(row?.isActive).toBe(true);
    });
  });

  describe('the unassigned pool is org-less by design, not a leak', () => {
    it('both tenants see the same org-less student', async () => {
      const asA = await request(http).get('/api/v1/users/unassigned').set('Cookie', aAdmin);
      const asB = await request(http).get('/api/v1/users/unassigned').set('Cookie', bAdmin);
      expect(asA.status).toBe(200);
      expect(asB.status).toBe(200);

      const pluck = (b: { data: { email: string }[] }) => b.data.map((u) => u.email);
      expect(pluck(asA.body)).toContain(LOOSE);
      expect(pluck(asB.body)).toContain(LOOSE);

      // But the pool is still ONLY org-less students — it is not a back door to
      // the other tenant's roster.
      expect(pluck(asB.body)).not.toContain(A_STUDENT);
    });

    it('assign-organization on an already-assigned foreign user 404s, never 409', async () => {
      // The distinction is the whole point: 409 "already in an org" would confirm
      // that this uuid names a real user somewhere, which is exactly what an org
      // admin must not be able to learn about another tenant.
      const res = await request(http)
        .post(`/api/v1/users/${id[A_STUDENT]}/assign-organization`)
        .set('Cookie', bAdmin)
        .send({});
      expect(res.status).toBe(404);

      const row = await repo.findOne({ where: { id: id[A_STUDENT] } });
      expect(row?.organizationId).toBe(orgA);
    });

    it('the claim of an org-less student is first-come — and only once', async () => {
      const first = await request(http)
        .post(`/api/v1/users/${id[LOOSE]}/assign-organization`)
        .set('Cookie', aAdmin)
        .send({});
      // 200, not 201: the route carries an explicit @HttpCode(200) because it
      // transitions an existing row rather than creating a resource.
      expect(first.status).toBe(200);
      expect((await repo.findOne({ where: { id: id[LOOSE] } }))?.organizationId).toBe(orgA);

      // B loses the race and learns nothing beyond "not available".
      const second = await request(http)
        .post(`/api/v1/users/${id[LOOSE]}/assign-organization`)
        .set('Cookie', bAdmin)
        .send({});
      expect(second.status).toBe(404);
      expect((await repo.findOne({ where: { id: id[LOOSE] } }))?.organizationId).toBe(orgA);
    });
  });

  describe('@Platform routes take no org id from a tenant actor', () => {
    it("403s an org ADMIN reading another org's platform detail", async () => {
      const res = await request(http)
        .get(`/api/v1/platform/organizations/${orgA}`)
        .set('Cookie', bAdmin);
      expect(res.status).toBe(403);
    });

    it('403s an org ADMIN reading their OWN org through the platform route', async () => {
      // Owning the org is irrelevant: @Platform is a role gate, not a scope check.
      const res = await request(http)
        .get(`/api/v1/platform/organizations/${orgB}`)
        .set('Cookie', bAdmin);
      expect(res.status).toBe(403);
    });

    it('403s an org ADMIN on the platform user list', async () => {
      const res = await request(http)
        .get(`/api/v1/platform/organizations/${orgA}/users`)
        .set('Cookie', bAdmin);
      expect(res.status).toBe(403);
    });
  });

  describe('privilege escalation, from the second tenant', () => {
    it('403s POST /users {role: superadmin}', async () => {
      const res = await request(http).post('/api/v1/users').set('Cookie', bAdmin).send({
        email: 'ti-escalate@codestack.dev',
        password: 'Password1',
        firstName: 'No',
        lastName: 'Way',
        role: 'superadmin',
      });
      expect(res.status).toBe(403);
      expect(await repo.findOne({ where: { email: 'ti-escalate@codestack.dev' } })).toBeNull();
    });

    it('403s PATCH /users/:id {role: superadmin} on their own student', async () => {
      const res = await request(http)
        .patch(`/api/v1/users/${id[B_STUDENT]}`)
        .set('Cookie', bAdmin)
        .send({ role: 'superadmin' });
      expect(res.status).toBe(403);
      expect((await repo.findOne({ where: { id: id[B_STUDENT] } }))?.role).toBe(Role.STUDENT);
    });

    it('403s a PROFESSOR minting a peer PROFESSOR (rank-monotonic)', async () => {
      const res = await request(http).post('/api/v1/users').set('Cookie', bProf).send({
        email: 'ti-peer-prof@codestack.dev',
        password: 'Password1',
        firstName: 'Peer',
        lastName: 'Prof',
        role: 'professor',
      });
      expect(res.status).toBe(403);
    });

    it('403s an ADMIN minting a PROFESSOR invite (the invite path, not the user path)', async () => {
      const res = await request(http)
        .post('/api/v1/invites')
        .set('Cookie', bAdmin)
        .send({ email: 'ti-invited-prof@codestack.dev', role: 'professor' });
      // Asserted as one object so a failure prints the BODY alongside the status.
      // This assertion was seen to fail once with a bare 404 in a full-suite run
      // and never reproduced in isolation or in two subsequent full runs; the only
      // 404 on this path is `OrganizationsService.getById` missing the actor's org.
      // A status-only assertion told us nothing about which it was.
      expect({ status: res.status, reason: res.body?.reason }).toEqual({
        status: 403,
        reason: 'role_not_invitable',
      });
    });

    it('the DB refuses an org-carrying superadmin outright (chk_users_org_required)', async () => {
      // The last line of defence, below every guard: even a direct INSERT cannot
      // create the shape that would inherit every isSuperAdmin() bypass while
      // still being scoped into a tenant.
      await expect(
        ds.query(
          `INSERT INTO users (email, password_hash, first_name, last_name, role, organization_id)
             VALUES ($1,'x','X','Y','superadmin',$2)`,
          ['ti-raw-escalate@codestack.dev', orgB],
        ),
      ).rejects.toThrow(QueryFailedError);

      const err = await ds
        .query(
          `INSERT INTO users (email, password_hash, first_name, last_name, role, organization_id)
             VALUES ($1,'x','X','Y','superadmin',$2)`,
          ['ti-raw-escalate2@codestack.dev', orgB],
        )
        .catch((e: QueryFailedError) => e);
      expect((err as unknown as { code: string }).code).toBe('23514');
    });
  });

  describe('suspending a tenant does not touch the other one', () => {
    it("blocks org B's members and leaves org A signing in", async () => {
      const suspend = await request(http)
        .post(`/api/v1/platform/organizations/${orgB}/suspend`)
        .set('Cookie', saCookie)
        .send({});
      expect(suspend.status).toBe(200); // @HttpCode(200) — a transition, not a creation

      // Session freshness: no re-login needed, the existing cookie is now dead.
      const blocked = await request(http).get('/api/v1/users?limit=5').set('Cookie', bAdmin);
      expect(blocked.status).toBe(403);
      expect(blocked.body.reason).toBe('org_suspended');

      const unaffected = await request(http).get('/api/v1/users?limit=5').set('Cookie', aAdmin);
      expect(unaffected.status).toBe(200);

      const back = await request(http)
        .post(`/api/v1/platform/organizations/${orgB}/activate`)
        .set('Cookie', saCookie)
        .send({});
      expect(back.status).toBe(200);
      expect((await request(http).get('/api/v1/users?limit=5').set('Cookie', bAdmin)).status).toBe(
        200,
      );
    });
  });
});
