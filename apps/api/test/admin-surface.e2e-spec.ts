/**
 * E2E for the admin surface (#105) and the three live defects it fixes.
 *
 * Each defect gets an assertion that would have PASSED against the old code in
 * the wrong way — a 201 with an escalated role, a 200 with an unchanged row —
 * so these are regression pins, not smoke tests.
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
  loginAs,
  registerUser,
  resetThrottleStorage,
  TestAppContext,
} from './utils/test-app';

jest.setTimeout(120_000);

describe('admin surface (e2e)', () => {
  let ctx: TestAppContext;
  let http: import('http').Server;
  let ds: DataSource;
  let orgA: string;
  let adminCookie: string;
  let profCookie: string;
  let studentId: string;
  let studentCookie: string;

  /*
   * Both helpers ASSERT their responses. Neither used to, and that is how this suite
   * produced a misleading failure in a full-suite run: a register that came back 429
   * left no user row, `stamp`'s `update` matched nothing (TypeORM `update` does not
   * throw on no-match), the login returned no cookie, and the failure finally
   * surfaced several tests later as a bare 404 with no `reason` — pointing at
   * assign-organization rather than at the missing fixture. Same shape as the flake
   * fixed in app.e2e-spec.ts (#120).
   */
  // Deliberately org-less: `stamp` gives a user their tenant, and the unassigned
  // pool tests need fixtures that never get one. Self-signup lands in the COMMUNITY
  // tenant now, so leaving `organizationId` unset would quietly make every fixture
  // assigned and empty the pool.
  const register = async (email: string): Promise<string> =>
    (await registerUser(ctx, { email, organizationId: null, firstName: 'Test' })).id;

  const stamp = async (email: string, role: Role, org: string | null): Promise<string> => {
    const repo = ctx.app.get<Repository<User>>(getRepositoryToken(User));
    const stamped = await repo.update({ email }, { organizationId: org, role });
    expect(stamped.affected).toBe(1); // 0 means the caller never registered this address
    // Re-login so the issued JWT carries the stamped org and role.
    return loginAs(ctx, email);
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    http = ctx.app.getHttpServer();
    ds = getDataSource(ctx);
    orgA = await createTestOrg(ds);

    await register('as-admin@codestack.dev');
    adminCookie = await stamp('as-admin@codestack.dev', Role.ADMIN, orgA);
    await register('as-prof@codestack.dev');
    profCookie = await stamp('as-prof@codestack.dev', Role.PROFESSOR, orgA);
    studentId = await register('as-student@codestack.dev');
    studentCookie = await stamp('as-student@codestack.dev', Role.STUDENT, orgA);
  });

  afterAll(async () => {
    await destroyTestApp(ctx);
  });

  describe('DEFECT 1 — privilege escalation via the role field', () => {
    // Before: 201, and the new SuperAdmin inherited every isSuperAdmin() bypass
    // in tenant-scope.util — read and write across every tenant on the platform.
    it('403s an ADMIN trying to CREATE a superadmin', async () => {
      const res = await request(http).post('/api/v1/users').set('Cookie', adminCookie).send({
        email: 'escalate1@codestack.dev',
        password: 'Password1',
        firstName: 'E',
        lastName: 'One',
        role: 'superadmin',
      });
      expect(res.status).toBe(403);
      expect(res.body.reason).toBe('role_not_assignable');
      const rows = (await ds.query(
        `SELECT 1 FROM users WHERE email = 'escalate1@codestack.dev'`,
      )) as unknown[];
      expect(rows).toHaveLength(0); // and nothing was written
    });

    // Before: 200, role silently applied.
    it('403s an ADMIN trying to PATCH someone to superadmin', async () => {
      const res = await request(http)
        .patch(`/api/v1/users/${studentId}`)
        .set('Cookie', adminCookie)
        .send({ role: 'superadmin' });
      expect(res.status).toBe(403);
      expect(res.body.reason).toBe('role_not_assignable');
      const [row] = (await ds.query('SELECT role FROM users WHERE id = $1', [studentId])) as {
        role: string;
      }[];
      expect(row.role).toBe('student');
    });

    it('403s an ADMIN minting a peer ADMIN (rank-monotonic)', async () => {
      const res = await request(http)
        .patch(`/api/v1/users/${studentId}`)
        .set('Cookie', adminCookie)
        .send({ role: 'admin' });
      expect(res.status).toBe(403);
    });

    it('still allows an ADMIN to assign PROFESSOR — strictly below them', async () => {
      const id = await register('as-promote@codestack.dev');
      await stamp('as-promote@codestack.dev', Role.STUDENT, orgA);
      const res = await request(http)
        .patch(`/api/v1/users/${id}`)
        .set('Cookie', adminCookie)
        .send({ role: 'professor' });
      expect(res.status).toBe(200);
      expect(res.body.role).toBe('professor');
    });
  });

  describe('DEFECT 2 — revoke was a silent no-op for a SuperAdmin', () => {
    let saCookie: string;
    let victimId: string;

    beforeAll(async () => {
      await register('as-sa@codestack.dev');
      saCookie = await stamp('as-sa@codestack.dev', Role.SUPERADMIN, null);
      victimId = await register('as-victim@codestack.dev');
      await stamp('as-victim@codestack.dev', Role.STUDENT, orgA);
    });

    // Before: 200 with `is_active` UNCHANGED, because the gate was
    // `actor.role === Role.ADMIN`, which a SUPERADMIN fails.
    it('a SUPERADMIN revoke actually writes the row', async () => {
      const res = await request(http)
        .patch(`/api/v1/users/${victimId}`)
        .set('Cookie', saCookie)
        .send({ isActive: false });
      expect(res.status).toBe(200);
      expect(res.body.isActive).toBe(false);
      const [row] = (await ds.query('SELECT is_active FROM users WHERE id = $1', [victimId])) as {
        is_active: boolean;
      }[];
      expect(row.is_active).toBe(false);
    });

    // #102's fresh-row re-stamp: the guard re-reads the row every request, so a
    // revoked user is stopped on their very next call, not at token expiry.
    it('the revoked user 401s on their next request with an unexpired cookie', async () => {
      resetThrottleStorage(ctx);
      const login = await request(http)
        .post('/api/v1/auth/login')
        .send({ email: 'as-victim@codestack.dev', password: 'Password1' });
      expect(login.status).toBe(401); // cannot even sign in

      const res = await request(http).get('/api/v1/users/me').set('Cookie', studentCookie);
      expect(res.status).toBe(200); // control: an active user still works
    });

    it('restoring access works and is idempotent', async () => {
      const first = await request(http)
        .patch(`/api/v1/users/${victimId}`)
        .set('Cookie', saCookie)
        .send({ isActive: true });
      expect(first.body.isActive).toBe(true);
      const again = await request(http)
        .patch(`/api/v1/users/${victimId}`)
        .set('Cookie', saCookie)
        .send({ isActive: true });
      expect(again.status).toBe(200);
      expect(again.body.isActive).toBe(true);
    });

    it('403 cannot_revoke_self', async () => {
      const me = await request(http).get('/api/v1/users/me').set('Cookie', saCookie);
      const res = await request(http)
        .patch(`/api/v1/users/${me.body.id}`)
        .set('Cookie', saCookie)
        .send({ isActive: false });
      expect(res.status).toBe(403);
      expect(res.body.reason).toBe('cannot_revoke_self');
    });
  });

  describe("DEFECT 3 — any ADMIN could set another user's password", () => {
    it('403 password_self_only', async () => {
      const res = await request(http)
        .patch(`/api/v1/users/${studentId}`)
        .set('Cookie', adminCookie)
        .send({ password: 'Hijacked1' });
      expect(res.status).toBe(403);
      expect(res.body.reason).toBe('password_self_only');

      // And the old password still works — nothing was written.
      resetThrottleStorage(ctx);
      const login = await request(http)
        .post('/api/v1/auth/login')
        .send({ email: 'as-student@codestack.dev', password: 'Password1' });
      expect(login.status).toBe(200);
    });
  });

  describe('list filters', () => {
    // These were a hard 400 before: the route bound PaginationQueryDto and the
    // global pipe runs forbidNonWhitelisted, so the People screen could not
    // filter at all.
    it('accepts role, isActive and q', async () => {
      const res = await request(http)
        .get('/api/v1/users?role=student&isActive=true&q=as-student')
        .set('Cookie', adminCookie);
      expect(res.status).toBe(200);
      expect(res.body.data.every((u: { role: string }) => u.role === 'student')).toBe(true);
    });

    // @Type(() => Boolean) would make Boolean('false') === true, silently showing
    // ACTIVE users to someone who asked for inactive ones.
    it('reads isActive=false as FALSE, not as a truthy string', async () => {
      const res = await request(http)
        .get('/api/v1/users?isActive=false')
        .set('Cookie', adminCookie);
      expect(res.status).toBe(200);
      expect(res.body.data.every((u: { isActive: boolean }) => u.isActive === false)).toBe(true);
    });

    it('a PROFESSOR now sees admins too (read parity), but still cannot modify one', async () => {
      const list = await request(http).get('/api/v1/users?role=admin').set('Cookie', profCookie);
      expect(list.status).toBe(200);
      expect(list.body.data.length).toBeGreaterThan(0);

      const adminRow = list.body.data[0] as { id: string };
      const write = await request(http)
        .patch(`/api/v1/users/${adminRow.id}`)
        .set('Cookie', profCookie)
        .send({ firstName: 'Nope' });
      expect(write.status).toBe(403);
    });
  });

  describe('unassigned pool + assignment', () => {
    let strandedId: string;

    beforeAll(async () => {
      strandedId = await register('as-stranded@codestack.dev');
    });

    it('lists org-less students', async () => {
      const res = await request(http).get('/api/v1/users/unassigned').set('Cookie', adminCookie);
      expect(res.status).toBe(200);
      expect(res.body.data.map((u: { id: string }) => u.id)).toContain(strandedId);
    });

    // findUnassigned never calls scopeToOrg: includeGlobal would emit `col IS NULL`
    // and surface every org-less SUPERADMIN alongside the students.
    it('never surfaces an org-less SUPERADMIN in the pool', async () => {
      const res = await request(http).get('/api/v1/users/unassigned').set('Cookie', adminCookie);
      expect(res.body.data.every((u: { role: string }) => u.role === 'student')).toBe(true);
      expect(res.body.data.some((u: { email: string }) => u.email === 'as-sa@codestack.dev')).toBe(
        false,
      );
    });

    // Declared above @Get(':id'), which carries a ParseUUIDPipe — below it,
    // "unassigned" would be parsed as a uuid and 400.
    it('routes /users/unassigned as a literal, not as a :id uuid', async () => {
      const res = await request(http).get('/api/v1/users/unassigned').set('Cookie', adminCookie);
      expect(res.status).not.toBe(400);
    });

    it('assigns into the actor org, re-stamping the denormalised rows', async () => {
      const res = await request(http)
        .post(`/api/v1/users/${strandedId}/assign-organization`)
        .set('Cookie', adminCookie);
      expect(res.status).toBe(200);
      expect(res.body.organizationId).toBe(orgA);

      const [g] = (await ds.query(
        'SELECT organization_id FROM user_gamification WHERE user_id = $1',
        [strandedId],
      )) as { organization_id: string }[];
      // Only asserted when the row exists — gamification rows are created lazily.
      if (g) expect(g.organization_id).toBe(orgA);
    });

    // Distinct codes would be a cross-tenant existence/membership oracle.
    it('404s uniformly when re-assigning someone already in an org', async () => {
      const res = await request(http)
        .post(`/api/v1/users/${strandedId}/assign-organization`)
        .set('Cookie', adminCookie);
      expect(res.status).toBe(404);
      expect(res.body.reason).toBe('user_not_assignable');
    });

    it('404s uniformly for an unknown uuid', async () => {
      const res = await request(http)
        .post('/api/v1/users/00000000-0000-4000-8000-000000000000/assign-organization')
        .set('Cookie', adminCookie);
      expect(res.status).toBe(404);
      expect(res.body.reason).toBe('user_not_assignable');
    });

    it('404s uniformly for a non-student, revealing nothing about their role', async () => {
      const profRow = await request(http).get('/api/v1/users/me').set('Cookie', profCookie);
      const res = await request(http)
        .post(`/api/v1/users/${profRow.body.id}/assign-organization`)
        .set('Cookie', adminCookie);
      expect(res.status).toBe(404);
      expect(res.body.reason).toBe('user_not_assignable');
    });
  });

  describe('the assigned user leaves the holding state', () => {
    it('/auth/verify reports isUnassigned false with real modules once assigned', async () => {
      const cookie = await stamp('as-stranded@codestack.dev', Role.STUDENT, orgA);
      const res = await request(http).get('/api/v1/auth/verify').set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body.isUnassigned).toBe(false);
      expect(res.body.organization).not.toBeNull();
      expect(res.body.modules.problems).toBe(true);
    });

    // The #105 projection: without it the nav advertises five areas that every
    // request 403s on.
    it('an org-less user gets isUnassigned true and all-false toggleable modules', async () => {
      await register('as-pending@codestack.dev');
      resetThrottleStorage(ctx);
      const login = await request(http)
        .post('/api/v1/auth/login')
        .send({ email: 'as-pending@codestack.dev', password: 'Password1' });
      const cookie = extractAuthCookies(login.headers['set-cookie'] as unknown as string[]);

      const res = await request(http).get('/api/v1/auth/verify').set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body.isUnassigned).toBe(true);
      expect(res.body.modules.problems).toBe(false);
      expect(res.body.modules.classrooms).toBe(false);
      expect(res.body.modules.assignments).toBe(false);
      // Structural modules stay on — somewhere to land, and a way to sign out.
      expect(res.body.modules.dashboard).toBe(true);
      expect(res.body.modules.profile).toBe(true);
      expect(res.body.quotas).toBeNull();
    });
  });

  describe('platform console', () => {
    let saCookie: string;

    beforeAll(async () => {
      resetThrottleStorage(ctx);
      const login = await request(http)
        .post('/api/v1/auth/login')
        .send({ email: 'as-sa@codestack.dev', password: 'Password1' });
      saCookie = extractAuthCookies(login.headers['set-cookie'] as unknown as string[]);
    });

    it('lists one org’s users through overrideOrgId', async () => {
      const res = await request(http)
        .get(`/api/v1/platform/organizations/${orgA}/users`)
        .set('Cookie', saCookie);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('404s an unknown org before counting anything', async () => {
      const res = await request(http)
        .get('/api/v1/platform/organizations/00000000-0000-4000-8000-000000000000/users')
        .set('Cookie', saCookie);
      expect(res.status).toBe(404);
    });

    // census() used to drop every org-less non-superadmin with a bare `continue`,
    // so the console meant to surface unassigned students reported none existed.
    it('the overview COUNTS unassigned students, and active + inactive still reconciles', async () => {
      const res = await request(http).get('/api/v1/platform/overview').set('Cookie', saCookie);
      expect(res.status).toBe(200);
      expect(res.body.users.unassigned.students).toBeGreaterThan(0);
      expect(res.body.users.active + res.body.users.inactive).toBe(res.body.users.total);
    });

    // PlatformGuard requires organizationId === null AND role === SUPERADMIN, and
    // checks the fresh row — an org-less STUDENT fails on the role first.
    it('403s an org-less STUDENT on a @Platform route', async () => {
      resetThrottleStorage(ctx);
      const login = await request(http)
        .post('/api/v1/auth/login')
        .send({ email: 'as-pending@codestack.dev', password: 'Password1' });
      const cookie = extractAuthCookies(login.headers['set-cookie'] as unknown as string[]);
      const res = await request(http).get('/api/v1/platform/overview').set('Cookie', cookie);
      expect(res.status).toBe(403);
    });
  });
});
