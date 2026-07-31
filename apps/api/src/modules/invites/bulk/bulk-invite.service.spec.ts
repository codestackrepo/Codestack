import { ConflictException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { DataSource, EntityManager } from 'typeorm';
import { Role } from '../../../common/enums/role.enum';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { MailService } from '../../mail/mail.service';
import { OrganizationsService } from '../../organizations/organizations.service';
import { QuotaService } from '../../quotas/quota.service';
import { BulkInviteService } from './bulk-invite.service';
import { RosterStagingService } from './roster-staging.service';
import { RosterAction, StagedRoster } from './roster.types';

const ORG = 'org-A';
const actor = (over: Partial<AuthenticatedUser> = {}): AuthenticatedUser => ({
  id: 'admin-1',
  email: 'admin@x.dev',
  role: Role.ADMIN,
  organizationId: ORG,
  ...over,
});

const csvFile = (text: string): Express.Multer.File =>
  ({ buffer: Buffer.from(text, 'utf8'), originalname: 'roster.csv' }) as Express.Multer.File;

interface Opts {
  headroom?: number | null;
  existingUsers?: {
    email: string;
    role?: string;
    organization_id?: string | null;
    is_active?: boolean;
  }[];
  pendingEmails?: string[];
  staged?: StagedRoster | null;
  quotaThrows?: Error;
  insertedEmails?: string[];
}

function setup(opts: Opts = {}) {
  const writes: string[] = [];

  const query = jest.fn((sql: string) => {
    if (sql.includes('FROM users')) {
      return Promise.resolve(
        (opts.existingUsers ?? []).map((u) => ({
          id: 'u',
          email: u.email,
          role: u.role ?? Role.STUDENT,
          organization_id: u.organization_id ?? null,
          is_active: u.is_active ?? true,
        })),
      );
    }
    if (sql.includes('FROM org_invites')) {
      return Promise.resolve((opts.pendingEmails ?? []).map((email) => ({ email })));
    }
    if (sql.includes('INSERT INTO org_invites')) {
      writes.push('insert');
      const emails = opts.insertedEmails ?? [];
      return Promise.resolve(emails.map((email, i) => ({ id: `inv-${i}`, email })));
    }
    if (sql.includes('UPDATE org_invites')) {
      writes.push('resend');
      // The REAL driver shape for UPDATE ... RETURNING: a [rows, rowCount] tuple,
      // NOT the rows. Mocking the rows directly is what let a wrong read of this
      // ship — the mock has to lie the same way the driver does.
      return Promise.resolve([
        [{ id: 'inv-r', email: 'p@x.dev', first_name: 'P', last_name: 'I' }],
        1,
      ]);
    }
    return Promise.resolve([]);
  });

  const manager = { query } as unknown as EntityManager;
  const dataSource = {
    manager,
    transaction: jest.fn((cb: (m: EntityManager) => unknown) => cb(manager)),
  } as unknown as DataSource;

  const staging = {
    stage: jest.fn().mockResolvedValue('staging-key'),
    load: jest.fn().mockResolvedValue(
      opts.staged ?? {
        organizationId: ORG,
        createdByUserId: 'admin-1',
        createdAt: new Date().toISOString(),
        rows: [],
        pendingResendable: [],
      },
    ),
    discard: jest.fn().mockResolvedValue(undefined),
    extend: jest.fn().mockResolvedValue(undefined),
  };

  const quotas = {
    checkHeadroom: jest.fn().mockResolvedValue(opts.headroom === undefined ? null : opts.headroom),
    assertWithinQuota: jest.fn((..._args: unknown[]) => {
      if (opts.quotaThrows) return Promise.reject(opts.quotaThrows);
      return Promise.resolve();
    }),
  };
  const orgs = { getById: jest.fn().mockResolvedValue({ id: ORG, name: 'Acme U' }) };
  const mailQueue = { addBulk: jest.fn().mockResolvedValue([]) };
  const mail = { webUrl: jest.fn((p: string) => `https://app.dev/${p}`) };

  const svc = new BulkInviteService(
    dataSource,
    mailQueue as unknown as Queue,
    staging as unknown as RosterStagingService,
    quotas as unknown as QuotaService,
    orgs as unknown as OrganizationsService,
    mail as unknown as MailService,
  );

  return { svc, staging, quotas, mailQueue, writes, query };
}

describe('BulkInviteService.preview', () => {
  const file = csvFile('email,first name,last name\nnew@x.dev,New,Student\n');

  // Everything before "commit" is a read. An abandoned preview leaves nothing
  // behind, and previewing a hostile file cannot change any state.
  it('performs ZERO Postgres mutations', async () => {
    const { svc, writes } = setup();
    await svc.preview(file, actor(), ORG);
    expect(writes).toEqual([]);
  });

  it('stages only the accepted rows, never the raw file', async () => {
    const { svc, staging } = setup();
    await svc.preview(
      csvFile('email,name\nnew@x.dev,New Student\nmember@x.dev,Al Ready\n'),
      actor(),
      ORG,
    );
    const [rows] = staging.stage.mock.calls[0];
    expect(rows).toHaveLength(2); // both are invites here
    expect(JSON.stringify(rows)).not.toContain('email,name'); // no file content
  });

  it('carries pending-invite addresses separately so resendPending can reach them', async () => {
    const { svc, staging } = setup({ pendingEmails: ['p@x.dev'] });
    await svc.preview(csvFile('email,name\np@x.dev,Pending I\n'), actor(), ORG);
    const [rows, pendingResendable] = staging.stage.mock.calls[0];
    expect(rows).toHaveLength(0); // a pending invite costs no seat and inserts nothing
    expect(pendingResendable).toEqual(['p@x.dev']);
  });

  it('blocks the commit up front when seats are short', async () => {
    const { svc } = setup({ headroom: 0 });
    const out = await svc.preview(file, actor(), ORG);
    expect(out.summary.seatsRequired).toBe(1);
    expect(out.canCommit).toBe(false);
  });

  // null means UNLIMITED, end to end. `?? 0` here would turn every uncapped org
  // into a blocked one.
  it('treats a null headroom as UNLIMITED, never as zero', async () => {
    const { svc } = setup({ headroom: null });
    const out = await svc.preview(file, actor(), ORG);
    expect(out.seatsAvailable).toBeNull();
    expect(out.canCommit).toBe(true);
  });

  it('allows a commit that exactly fills the remaining seats', async () => {
    const { svc } = setup({ headroom: 1 });
    expect((await svc.preview(file, actor(), ORG)).canCommit).toBe(true);
  });

  // "Everyone in this file is already a member" is a valid answer, not a 400.
  it('returns a 100%-skip file as a successful preview with willInvite 0', async () => {
    const { svc } = setup({ existingUsers: [{ email: 'm@x.dev', organization_id: ORG }] });
    const out = await svc.preview(csvFile('email,name\nm@x.dev,Al Ready\n'), actor(), ORG);
    expect(out.summary).toMatchObject({ willInvite: 0, willSkip: 1, seatsRequired: 0 });
    expect(out.canCommit).toBe(true);
  });
});

describe('BulkInviteService.commit', () => {
  const stagedWith = (emails: string[]): StagedRoster => ({
    organizationId: ORG,
    createdByUserId: 'admin-1',
    createdAt: new Date().toISOString(),
    rows: emails.map((email, i) => ({
      rowNumber: i + 2,
      email,
      firstName: 'A',
      lastName: 'B',
      action: RosterAction.INVITE,
    })),
    pendingResendable: [],
  });

  it('authorizes the staging key before doing anything', async () => {
    const { svc, staging } = setup({
      staged: stagedWith(['a@x.dev']),
      insertedEmails: ['a@x.dev'],
    });
    await svc.commit({ stagingKey: 'k' }, actor(), ORG);
    expect(staging.load).toHaveBeenCalledWith('k', expect.objectContaining({ id: 'admin-1' }), ORG);
  });

  it('discards the staged roster ONLY after the transaction succeeds', async () => {
    const { svc, staging } = setup({
      staged: stagedWith(['a@x.dev']),
      insertedEmails: ['a@x.dev'],
    });
    await svc.commit({ stagingKey: 'k' }, actor(), ORG);
    expect(staging.discard).toHaveBeenCalledWith('k');
    expect(staging.extend).not.toHaveBeenCalled();
  });

  // The usual failure is quota_exceeded, which the admin fixes by raising the cap.
  // Dropping the key would force a 2000-row re-upload to change one number.
  it('KEEPS the staged roster alive when the commit fails', async () => {
    const { svc, staging } = setup({
      staged: stagedWith(['a@x.dev']),
      quotaThrows: new ConflictException({ reason: 'quota_exceeded' }),
    });
    await expect(svc.commit({ stagingKey: 'k' }, actor(), ORG)).rejects.toThrow();
    expect(staging.extend).toHaveBeenCalledWith('k');
    expect(staging.discard).not.toHaveBeenCalled();
  });

  it('recomputes the seat charge AFTER exclusions, not from the preview count', async () => {
    const { svc, quotas } = setup({
      staged: stagedWith(['a@x.dev', 'b@x.dev', 'c@x.dev']),
      insertedEmails: ['a@x.dev'],
    });
    await svc.commit({ stagingKey: 'k', excludeRowNumbers: [3, 4] }, actor(), ORG);
    expect(quotas.assertWithinQuota).toHaveBeenCalledWith(ORG, 'max_users', 1, expect.anything());
  });

  it('charges inside the transaction, with the transaction manager', async () => {
    const { svc, quotas } = setup({ staged: stagedWith(['a@x.dev']), insertedEmails: ['a@x.dev'] });
    await svc.commit({ stagingKey: 'k' }, actor(), ORG);
    const call = quotas.assertWithinQuota.mock.calls[0] as unknown[];
    expect(call[3]).toBeDefined();
  });

  it('never inserts when the quota check rejects', async () => {
    const { svc, writes } = setup({
      staged: stagedWith(['a@x.dev']),
      quotaThrows: new ConflictException({ reason: 'quota_exceeded' }),
    });
    await expect(svc.commit({ stagingKey: 'k' }, actor(), ORG)).rejects.toThrow();
    expect(writes).not.toContain('insert');
  });

  // Someone accepting a single invite in the meantime must not blow up an
  // unrelated 2000-row commit: the batch's intent for that row is already met.
  it('downgrades benign drift (became a member) to a warning', async () => {
    const { svc } = setup({
      staged: stagedWith(['a@x.dev', 'joined@x.dev']),
      existingUsers: [{ email: 'joined@x.dev', organization_id: ORG }],
      insertedEmails: ['a@x.dev'],
    });
    const out = await svc.commit({ stagingKey: 'k' }, actor(), ORG);
    expect(out.warnings.join(' ')).toContain('joined@x.dev');
    expect(out.invited).toBe(1);
  });

  // Seat-affecting drift is different: the row is now unusable, so the admin
  // needs to see the file again rather than have it silently shrink.
  it('aborts 409 roster_state_changed on seat-affecting drift', async () => {
    const { svc } = setup({
      staged: stagedWith(['a@x.dev']),
      existingUsers: [{ email: 'a@x.dev', organization_id: 'org-OTHER' }],
    });
    await expect(svc.commit({ stagingKey: 'k' }, actor(), ORG)).rejects.toMatchObject({
      response: { reason: 'roster_state_changed' },
    });
  });

  it('enqueues one mail per minted invite, after the transaction', async () => {
    const { svc, mailQueue } = setup({
      staged: stagedWith(['a@x.dev', 'b@x.dev']),
      insertedEmails: ['a@x.dev', 'b@x.dev'],
    });
    await svc.commit({ stagingKey: 'k' }, actor(), ORG);
    const [jobs] = mailQueue.addBulk.mock.calls[0] as [{ opts: { jobId: string } }[]];
    expect(jobs).toHaveLength(2);
    // Never undefined — BullMQ would generate one and the double-click dedupe
    // would silently stop working.
    for (const job of jobs) expect(job.opts.jobId).toMatch(/^invite-mail:inv-\d+$/);
  });

  it('mails a DIFFERENT token per recipient, matched by email not by index', async () => {
    const { svc, mailQueue } = setup({
      staged: stagedWith(['a@x.dev', 'b@x.dev']),
      // Deliberately reversed: RETURNING order is not guaranteed to match VALUES
      // order, so index-pairing would mail each person the other's token.
      insertedEmails: ['b@x.dev', 'a@x.dev'],
    });
    await svc.commit({ stagingKey: 'k' }, actor(), ORG);
    const [jobs] = mailQueue.addBulk.mock.calls[0] as [
      { data: { to: string; params: { acceptUrl: string } } }[],
    ];
    const tokens = jobs.map((j) => j.data.params.acceptUrl.split('/invite/')[1]);
    expect(new Set(tokens).size).toBe(2);
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('a 100%-excluded commit succeeds, inserting and mailing nothing', async () => {
    const { svc, mailQueue, writes } = setup({ staged: stagedWith(['a@x.dev']) });
    const out = await svc.commit({ stagingKey: 'k', excludeRowNumbers: [2] }, actor(), ORG);
    expect(out).toMatchObject({ invited: 0, skipped: 1 });
    expect(writes).not.toContain('insert');
    expect(mailQueue.addBulk).not.toHaveBeenCalled();
  });

  describe('resendPending', () => {
    const withPending: StagedRoster = {
      organizationId: ORG,
      createdByUserId: 'admin-1',
      createdAt: new Date().toISOString(),
      rows: [],
      pendingResendable: ['p@x.dev'],
    };

    it('does nothing by default', async () => {
      const { svc, writes } = setup({ staged: withPending });
      await svc.commit({ stagingKey: 'k' }, actor(), ORG);
      expect(writes).not.toContain('resend');
    });

    // An UPDATE, never a second INSERT: the row already holds its seat, and
    // uq_org_invites_org_pending_email would reject the duplicate anyway.
    it('re-mints the EXISTING row when asked, inserting nothing', async () => {
      const { svc, writes } = setup({ staged: withPending });
      await svc.commit({ stagingKey: 'k', resendPending: true }, actor(), ORG);
      expect(writes).toContain('resend');
      expect(writes).not.toContain('insert');
    });

    it('charges no seat for a resend', async () => {
      const { svc, quotas } = setup({ staged: withPending });
      await svc.commit({ stagingKey: 'k', resendPending: true }, actor(), ORG);
      expect(quotas.assertWithinQuota).toHaveBeenCalledWith(ORG, 'max_users', 0, expect.anything());
    });
  });
});
