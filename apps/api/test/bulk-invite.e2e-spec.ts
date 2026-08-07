/**
 * E2E for bulk roster onboarding (#106).
 *
 * Drives the real multipart upload, the real Redis staging key and the real
 * all-or-nothing quota, and checks Postgres directly afterwards — a preview that
 * secretly wrote rows, or a blocked commit that wrote some of them, would pass
 * any assertion made only against the response body.
 */
import ExcelJS from 'exceljs';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { Role } from '../src/common/enums/role.enum';
import {
  createTestApp,
  createTestOrg,
  destroyTestApp,
  getDataSource,
  loginAs,
  registerUser,
  TestAppContext,
} from './utils/test-app';

jest.setTimeout(120_000);

const csv = (text: string): Buffer => Buffer.from(text, 'utf8');

describe('bulk roster onboarding (e2e)', () => {
  let ctx: TestAppContext;
  let http: import('http').Server;
  let ds: DataSource;
  let orgA: string;
  let adminCookie: string;

  /**
   * Register + stamp + sign in, in one step (#149). Kept as a two-name shim so
   * the call sites below read unchanged: `register` returns the id, `stamp`
   * returns the cookie for an address `register` already created.
   */
  const created = new Map<string, { id: string; cookie: string }>();

  // Org-less on purpose — see admin-surface: `stamp` is what assigns a tenant, and
  // the roster classifier needs genuinely unassigned fixtures.
  const register = async (email: string): Promise<string> => {
    const user = await registerUser(ctx, {
      email,
      organizationId: null,
      firstName: 'T',
      lastName: 'U',
    });
    created.set(email, { id: user.id, cookie: user.cookie });
    return user.id;
  };

  const stamp = async (email: string, role: Role, org: string | null): Promise<string> => {
    if (!created.has(email)) await register(email);
    const ds2 = getDataSource(ctx);
    await ds2.query(`UPDATE "users" SET "organization_id" = $2, "role" = $3 WHERE "email" = $1`, [
      email,
      org,
      role,
    ]);
    // Re-login so the issued JWT carries the stamped org and role.
    return loginAs(ctx, email);
  };

  const upload = (body: Buffer, filename = 'roster.csv', cookie = adminCookie) =>
    request(http)
      .post('/api/v1/invites/bulk/preview')
      .set('Cookie', cookie)
      .attach('file', body, filename);

  const pendingCount = async (): Promise<number> => {
    const [row] = (await ds.query(
      `SELECT COUNT(*)::int AS n FROM org_invites WHERE organization_id = $1 AND status = 'pending'`,
      [orgA],
    )) as { n: number }[];
    return row.n;
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    http = ctx.app.getHttpServer();
    ds = getDataSource(ctx);
    orgA = await createTestOrg(ds);
    await register('bulk-admin@codestack.dev');
    adminCookie = await stamp('bulk-admin@codestack.dev', Role.ADMIN, orgA);
  });

  afterAll(async () => {
    await destroyTestApp(ctx);
  });

  describe('upload guard', () => {
    it('rejects a legacy .xls by MAGIC BYTES with Save-As guidance', async () => {
      // OLE2 signature — what a real .xls starts with, renamed to .xlsx so only
      // the byte check can catch it.
      const ole = Buffer.concat([
        Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
        Buffer.alloc(64),
      ]);
      const res = await upload(ole, 'roster.xlsx');
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ reason: 'unsupported_file_type', detected: 'xls' });
      expect(res.body.message).toContain('Save As');
    });

    it('rejects a binary that is neither ZIP nor OLE', async () => {
      const res = await upload(Buffer.from([0x00, 0x01, 0x02, 0x03, 0x00]), 'roster.csv');
      expect(res.status).toBe(400);
      expect(res.body.reason).toBe('unsupported_file_type');
    });

    it('rejects an unexpected extension before reading a byte', async () => {
      const res = await upload(csv('email,name\na@x.dev,A B\n'), 'roster.txt');
      expect(res.status).toBe(400);
    });

    // Nest's transformException converts MulterError to an HttpException before
    // any filter runs, so @Catch(MulterError) can never fire — the filter keys on
    // PayloadTooLargeException's message instead.
    it('maps multer’s size rejection to 413 file_too_large', async () => {
      const big = Buffer.concat([
        Buffer.from('email,name\n'),
        Buffer.from('a@x.dev,Padding Name\n'.repeat(120_000)),
      ]);
      expect(big.length).toBeGreaterThan(2 * 1024 * 1024);
      const res = await upload(big);
      expect(res.status).toBe(413);
      expect(res.body).toMatchObject({ reason: 'file_too_large', maxBytes: 2 * 1024 * 1024 });
    });

    it('400s when no file is attached', async () => {
      const res = await request(http)
        .post('/api/v1/invites/bulk/preview')
        .set('Cookie', adminCookie);
      expect(res.status).toBe(400);
      expect(res.body.reason).toBe('file_required');
    });
  });

  describe('preview', () => {
    it('classifies a mixed roster and writes NOTHING to Postgres', async () => {
      // Seed the states the classifier discriminates.
      await register('bulk-member@codestack.dev');
      await stamp('bulk-member@codestack.dev', Role.STUDENT, orgA);
      await register('bulk-unassigned@codestack.dev'); // stays org-less
      const otherOrg = await createTestOrg(ds);
      await register('bulk-other@codestack.dev');
      await stamp('bulk-other@codestack.dev', Role.STUDENT, otherOrg);

      const before = await pendingCount();
      const res = await upload(
        csv(
          'email,first name,last name\n' +
            'bulk-new@codestack.dev,New,Student\n' +
            'BULK-NEW@CODESTACK.DEV,Dupe,Row\n' +
            'bulk-member@codestack.dev,Already,Member\n' +
            'bulk-unassigned@codestack.dev,Un,Assigned\n' +
            'bulk-other@codestack.dev,Other,Org\n' +
            'not-an-email,Bad,Address\n',
        ),
      );

      expect(res.status).toBe(200);
      type Row = { rowNumber: number; email: string; action: string; reason?: string };
      const rows = res.body.rows as Row[];
      // FIRST occurrence: the file deliberately repeats one address, and
      // Object.fromEntries would keep the duplicate (a skip) instead.
      const byEmail = (email: string): Row => rows.find((r) => r.email === email) as Row;
      expect(byEmail('bulk-new@codestack.dev').action).toBe('invite');
      // ...and the repeat of that same address is the duplicate skip.
      expect(rows.filter((r) => r.email === 'bulk-new@codestack.dev')[1]).toMatchObject({
        action: 'skip',
        reason: 'duplicate_in_file',
      });
      expect(byEmail('bulk-member@codestack.dev')).toMatchObject({
        action: 'skip',
        reason: 'already_member',
      });
      expect(byEmail('bulk-unassigned@codestack.dev').action).toBe('claim');
      expect(byEmail('bulk-other@codestack.dev')).toMatchObject({
        action: 'error',
        reason: 'not_available',
      });
      expect(res.body.errors[0].reason).toBe('invalid_email');
      expect(res.body.summary).toMatchObject({ willInvite: 1, willClaim: 1, seatsRequired: 2 });

      // The upload wrote nothing.
      expect(await pendingCount()).toBe(before);
    });

    it('never leaks the other tenant’s identity in the opaque row', async () => {
      const res = await upload(csv('email,name\nbulk-other@codestack.dev,Other Org\n'));
      const row = res.body.rows[0] as { message: string };
      expect(row.message).not.toMatch(/organi[sz]ation [0-9a-f-]{36}/);
      expect(JSON.stringify(res.body)).not.toContain('org-');
    });

    it('parses an .xlsx identically to the equivalent .csv', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Roster');
      ws.addRow(['Email', 'First Name', 'Last Name']);
      ws.addRow(['bulk-xlsx@codestack.dev', 'Ex', 'Cel']);
      const buffer = Buffer.from(await wb.xlsx.writeBuffer());

      const res = await upload(buffer, 'roster.xlsx');
      expect(res.status).toBe(200);
      expect(res.body.rows[0]).toMatchObject({
        email: 'bulk-xlsx@codestack.dev',
        action: 'invite',
      });
    });

    // "Everyone in this file is already a member" is a valid answer, not a 400.
    it('returns 200 with willInvite 0 for a file that is entirely skips', async () => {
      const res = await upload(csv('email,name\nbulk-member@codestack.dev,Already Member\n'));
      expect(res.status).toBe(200);
      expect(res.body.summary.willInvite).toBe(0);
      expect(res.body.canCommit).toBe(true);
    });
  });

  describe('commit', () => {
    it('mints invites and consumes the staging key', async () => {
      const preview = await upload(
        csv('email,first name,last name\nbulk-c1@codestack.dev,C,One\n'),
      );
      const { stagingKey } = preview.body as { stagingKey: string };

      const res = await request(http)
        .post('/api/v1/invites/bulk/commit')
        .set('Cookie', adminCookie)
        .send({ stagingKey });
      expect(res.status).toBe(201);
      expect(res.body.invited).toBe(1);

      const [row] = (await ds.query(
        `SELECT source, kind, batch_id, token_hash FROM org_invites WHERE email = $1`,
        ['bulk-c1@codestack.dev'],
      )) as { source: string; kind: string; batch_id: string; token_hash: string }[];
      expect(row).toMatchObject({ source: 'bulk', kind: 'new_account' });
      expect(row.batch_id).toBeTruthy();
      expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);

      // The key is single-use.
      const replay = await request(http)
        .post('/api/v1/invites/bulk/commit')
        .set('Cookie', adminCookie)
        .send({ stagingKey });
      expect(replay.status).toBe(404);
      expect(replay.body.reason).toBe('staging_expired');
    });

    it('mints a CLAIM invite for an unassigned student — never re-homing them', async () => {
      const before = (await ds.query(`SELECT organization_id FROM users WHERE email = $1`, [
        'bulk-unassigned@codestack.dev',
      ])) as { organization_id: string | null }[];
      expect(before[0].organization_id).toBeNull();

      const preview = await upload(csv('email,name\nbulk-unassigned@codestack.dev,Un Assigned\n'));
      await request(http)
        .post('/api/v1/invites/bulk/commit')
        .set('Cookie', adminCookie)
        .send({ stagingKey: preview.body.stagingKey });

      const [invite] = (await ds.query(`SELECT kind FROM org_invites WHERE email = $1`, [
        'bulk-unassigned@codestack.dev',
      ])) as { kind: string }[];
      expect(invite.kind).toBe('claim');

      // The account was NOT moved — they have to click.
      const after = (await ds.query(`SELECT organization_id FROM users WHERE email = $1`, [
        'bulk-unassigned@codestack.dev',
      ])) as { organization_id: string | null }[];
      expect(after[0].organization_id).toBeNull();
    });

    it('403s a staging key belonging to a different admin', async () => {
      const preview = await upload(csv('email,name\nbulk-c2@codestack.dev,C Two\n'));
      await register('bulk-admin2@codestack.dev');
      const other = await stamp('bulk-admin2@codestack.dev', Role.ADMIN, orgA);

      const res = await request(http)
        .post('/api/v1/invites/bulk/commit')
        .set('Cookie', other)
        .send({ stagingKey: preview.body.stagingKey });
      expect(res.status).toBe(403);
      expect(res.body.reason).toBe('staging_not_yours');
    });

    it('honours excludeRowNumbers and recomputes the charge', async () => {
      const preview = await upload(
        csv(
          'email,name\n' +
            'bulk-e1@codestack.dev,E One\n' +
            'bulk-e2@codestack.dev,E Two\n' +
            'bulk-e3@codestack.dev,E Three\n',
        ),
      );
      const res = await request(http)
        .post('/api/v1/invites/bulk/commit')
        .set('Cookie', adminCookie)
        .send({ stagingKey: preview.body.stagingKey, excludeRowNumbers: [3, 4] });
      expect(res.status).toBe(201);
      expect(res.body.invited).toBe(1);

      const rows = (await ds.query(
        `SELECT email FROM org_invites WHERE email LIKE 'bulk-e%@codestack.dev'`,
      )) as { email: string }[];
      expect(rows.map((r) => r.email)).toEqual(['bulk-e1@codestack.dev']);
    });
  });

  describe('all-or-nothing quota', () => {
    it('blocks the preview and then the commit, writing NOTHING', async () => {
      // Cap the org two seats above its current usage, then upload five.
      const [seat] = (await ds.query(
        `SELECT (SELECT COUNT(*) FROM users WHERE organization_id = $1 AND is_active = true)
              + (SELECT COUNT(*) FROM org_invites WHERE organization_id = $1
                   AND status = 'pending' AND expires_at > now()) AS n`,
        [orgA],
      )) as { n: string }[];
      const cap = Number(seat.n) + 2;
      await ds.query(
        `INSERT INTO org_quotas (organization_id, resource, limit_value) VALUES ($1,'max_users',$2)
           ON CONFLICT (organization_id, resource) DO UPDATE SET limit_value = EXCLUDED.limit_value`,
        [orgA, cap],
      );

      const body = csv(
        'email,name\n' +
          Array.from({ length: 5 }, (_, i) => `bulk-q${i}@codestack.dev,Q ${i}`).join('\n') +
          '\n',
      );
      const preview = await upload(body);
      expect(preview.status).toBe(200);
      expect(preview.body.summary.seatsRequired).toBe(5);
      expect(preview.body.seatsAvailable).toBe(2);
      // The admin is told BEFORE they press the button.
      expect(preview.body.canCommit).toBe(false);

      const before = await pendingCount();
      const res = await request(http)
        .post('/api/v1/invites/bulk/commit')
        .set('Cookie', adminCookie)
        .send({ stagingKey: preview.body.stagingKey });

      expect(res.status).toBe(409);
      // Every number the dialog needs, no client arithmetic.
      expect(res.body).toMatchObject({
        reason: 'quota_exceeded',
        resource: 'max_users',
        limit: cap,
        attempted: 5,
      });
      // All-or-nothing: not one of the five landed.
      expect(await pendingCount()).toBe(before);

      // And the staged roster survived, so raising the cap is enough to retry.
      const retryBlocked = await request(http)
        .post('/api/v1/invites/bulk/commit')
        .set('Cookie', adminCookie)
        .send({ stagingKey: preview.body.stagingKey });
      expect(retryBlocked.status).toBe(409); // still capped, but the key is alive

      await ds.query(`UPDATE org_quotas SET limit_value = NULL WHERE organization_id = $1`, [orgA]);
      const retry = await request(http)
        .post('/api/v1/invites/bulk/commit')
        .set('Cookie', adminCookie)
        .send({ stagingKey: preview.body.stagingKey });
      expect(retry.status).toBe(201);
      expect(retry.body.invited).toBe(5);
    });

    it('reports UNLIMITED as null, never as zero', async () => {
      const res = await upload(csv('email,name\nbulk-u1@codestack.dev,U One\n'));
      expect(res.body.seatsAvailable).toBeNull();
      expect(res.body.canCommit).toBe(true);
    });
  });

  /**
   * `resendPending` — the branch a merged bug lived in.
   *
   * `manager.query('UPDATE ... RETURNING ...')` hands back a `[rows, rowCount]`
   * TUPLE through the raw pg driver, not the rows. The original code iterated the
   * tuple as if it were rows, so every resend silently rotated the hash in the
   * database and then mailed NOBODY — the invitee was left holding a link that no
   * longer worked, with no error anywhere. The unit spec passed because its mock
   * returned a bare array, i.e. it encoded the assumption instead of the contract.
   *
   * So the assertions here are deliberately on OBSERVABLE state: the row's hash
   * changed, `send_count` advanced, and the returned count matches. Nothing is
   * taken on the response's word alone.
   */
  describe('resendPending rotates tokens on the existing rows', () => {
    const E1 = 'bulk-resend-1@codestack.dev';
    const E2 = 'bulk-resend-2@codestack.dev';

    const inviteRow = async (email: string) => {
      const [row] = (await ds.query(
        `SELECT id, token_hash, send_count FROM org_invites
          WHERE organization_id = $1 AND lower(email) = $2`,
        [orgA, email],
      )) as { id: string; token_hash: string; send_count: number }[];
      return row;
    };

    beforeAll(async () => {
      await ds.query(`UPDATE org_quotas SET limit_value = NULL WHERE organization_id = $1`, [orgA]);
      const first = await upload(csv(`email,name\n${E1},R One\n${E2},R Two\n`));
      expect(first.status).toBe(200); // preview carries @HttpCode(200)
      const commit = await request(http)
        .post('/api/v1/invites/bulk/commit')
        .set('Cookie', adminCookie)
        .send({ stagingKey: first.body.stagingKey });
      expect(commit.status).toBe(201);
      expect(commit.body.invited).toBe(2);
    });

    it('skips already-pending rows by default, charging no seat', async () => {
      const before = await pendingCount();
      const preview = await upload(csv(`email,name\n${E1},R One\n${E2},R Two\n`));
      expect(preview.status).toBe(200);
      expect(preview.body.summary.willInvite).toBe(0);
      expect(preview.body.summary.seatsRequired).toBe(0);

      const commit = await request(http)
        .post('/api/v1/invites/bulk/commit')
        .set('Cookie', adminCookie)
        .send({ stagingKey: preview.body.stagingKey });
      expect(commit.status).toBe(201);
      expect(commit.body.invited).toBe(0);
      expect(await pendingCount()).toBe(before); // no second row, no extra seat
    });

    it('with resendPending, UPDATEs each row in place — new hash, bumped count', async () => {
      const beforeRows: Record<string, Awaited<ReturnType<typeof inviteRow>>> = {
        [E1]: await inviteRow(E1),
        [E2]: await inviteRow(E2),
      };
      const beforeCount = await pendingCount();

      const preview = await upload(csv(`email,name\n${E1},R One\n${E2},R Two\n`));
      const commit = await request(http)
        .post('/api/v1/invites/bulk/commit')
        .set('Cookie', adminCookie)
        .send({ stagingKey: preview.body.stagingKey, resendPending: true });
      expect(commit.status).toBe(201);

      for (const email of [E1, E2]) {
        const after = await inviteRow(email);
        // Same row — an INSERT here would have violated the partial unique index
        // and double-charged a seat.
        expect(after.id).toBe(beforeRows[email].id);
        expect(after.token_hash).toMatch(/^[0-9a-f]{64}$/);
        expect(after.token_hash).not.toBe(beforeRows[email].token_hash);
        expect(after.send_count).toBe(beforeRows[email].send_count + 1);
      }
      expect(await pendingCount()).toBe(beforeCount);
    });
  });
});
