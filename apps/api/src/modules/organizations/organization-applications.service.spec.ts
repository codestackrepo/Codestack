import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { MailService } from '../mail/mail.service';
import { MailTemplate } from '../mail/mail.types';
import { QuotaResource } from '../quotas/enums/quota-resource.enum';
import { QuotaService } from '../quotas/quota.service';
import { OrganizationApplication } from './entities/organization-application.entity';
import { OrgApplicationStatus } from './enums/organization-application.enums';
import { OrganizationType } from './enums/organization.enums';
import { OrganizationApplicationsService } from './organization-applications.service';

const DTO = {
  organizationName: 'Acme University',
  contactName: 'Ada Lovelace',
  contactEmail: 'ada@acme.edu',
};

const application = (over: Partial<OrganizationApplication> = {}): OrganizationApplication =>
  ({
    id: 'app-1',
    organizationName: 'Acme University',
    organizationType: OrganizationType.UNIVERSITY,
    website: null,
    contactName: 'Ada Lovelace',
    contactEmail: 'ada@acme.edu',
    message: '',
    status: OrgApplicationStatus.PENDING,
    reviewedById: null,
    reviewedAt: null,
    decisionReason: '',
    organizationId: null,
    createdAt: new Date('2026-08-01'),
    ...over,
  }) as OrganizationApplication;

const actor = (): AuthenticatedUser =>
  ({
    id: 'sa-1',
    email: 'root@codestack.dev',
    role: Role.SUPERADMIN,
    organizationId: null,
  }) as AuthenticatedUser;

interface Opts {
  pendingExisting?: OrganizationApplication | null;
  found?: OrganizationApplication | null;
  saveError?: unknown;
  flipAffected?: number;
  /** Slug attempts that fail before one succeeds. */
  slugConflicts?: number;
  superAdmins?: Array<{ email: string }>;
}

function setup(opts: Opts = {}) {
  const sql: string[] = [];

  const pendingQb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(opts.pendingExisting ?? null),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[application()], 1]),
  };

  const flipBuilder: Record<string, jest.Mock> = {
    update: jest.fn(() => flipBuilder),
    set: jest.fn(() => flipBuilder),
    where: jest.fn(() => flipBuilder),
    execute: jest.fn(() => Promise.resolve({ affected: opts.flipAffected ?? 1 })),
  };

  const applications = {
    createQueryBuilder: jest.fn((alias?: string) => (alias ? pendingQb : flipBuilder)),
    create: jest.fn((v: unknown) => v),
    save: jest.fn((v: unknown) =>
      opts.saveError ? Promise.reject(opts.saveError) : Promise.resolve(application(v as object)),
    ),
    findOne: jest.fn().mockResolvedValue(opts.found === undefined ? application() : opts.found),
    findOneOrFail: jest.fn().mockResolvedValue(application()),
  } as unknown as Repository<OrganizationApplication>;

  // Each failing slug attempt rejects with a slug unique violation.
  let attempts = 0;
  const orgRepo = {
    create: jest.fn((v: unknown) => v),
    save: jest.fn((v: { slug: string }) => {
      attempts += 1;
      if (attempts <= (opts.slugConflicts ?? 0)) {
        return Promise.reject({ code: '23505', constraint: 'uq_organizations_slug' });
      }
      return Promise.resolve({ id: 'org-new', name: 'Acme University', slug: v.slug });
    }),
  };

  // `approve` re-reads the row after the flip so the returned DTO carries the real
  // `reviewedAt`/`reviewedById` rather than the pre-flip nulls.
  const appRepoInTx = {
    update: jest.fn().mockResolvedValue(undefined),
    findOneOrFail: jest.fn().mockResolvedValue(
      application({
        status: OrgApplicationStatus.APPROVED,
        reviewedById: 'sa-1',
        reviewedAt: new Date('2026-08-01T10:00:00Z'),
        organizationId: 'org-new',
      }),
    ),
  };

  const manager = {
    query: jest.fn((text: string) => {
      sql.push(text);
      return Promise.resolve([]);
    }),
    createQueryBuilder: jest.fn(() => flipBuilder),
    getRepository: jest.fn((entity: unknown) =>
      entity === OrganizationApplication ? appRepoInTx : orgRepo,
    ),
  } as unknown as EntityManager;

  const userRepo = {
    find: jest.fn().mockResolvedValue(opts.superAdmins ?? [{ email: 'root@codestack.dev' }]),
  };

  const dataSource = {
    transaction: jest.fn((cb: (m: EntityManager) => unknown) => cb(manager)),
    getRepository: jest.fn(() => userRepo),
  } as unknown as DataSource;

  const quotas = { setLimit: jest.fn().mockResolvedValue(undefined) } as unknown as QuotaService;
  const mail = {
    enqueue: jest.fn().mockResolvedValue(undefined),
    webUrl: jest.fn((p: string) => `https://app.dev/${p}`),
  };

  const svc = new OrganizationApplicationsService(
    applications,
    dataSource,
    quotas,
    mail as unknown as MailService,
  );
  return { svc, applications, quotas, mail, orgRepo, appRepoInTx, sql, userRepo };
}

/**
 * The enumeration contract. This is an UNAUTHENTICATED write, so nothing observable may
 * differ between "created" and "already exists" — the controller answers one fixed 202
 * and this service must not throw.
 */
describe('OrganizationApplicationsService.submit', () => {
  it('stores the application and acknowledges the applicant', async () => {
    const { svc, mail } = setup();
    await svc.submit(DTO as never);

    const templates = mail.enqueue.mock.calls.map((c) => (c[0] as { template: string }).template);
    expect(templates).toContain(MailTemplate.ORG_APPLICATION_RECEIVED);
  });

  it('lowercases the contact address so case cannot open a second slot', async () => {
    const { svc, applications } = setup();
    await svc.submit({ ...DTO, contactEmail: 'AdA@Acme.EDU' } as never);
    expect((applications.create as jest.Mock).mock.calls[0][0]).toMatchObject({
      contactEmail: 'ada@acme.edu',
    });
  });

  it('defaults the organization type to university', async () => {
    const { svc, applications } = setup();
    await svc.submit(DTO as never);
    expect((applications.create as jest.Mock).mock.calls[0][0]).toMatchObject({
      organizationType: OrganizationType.UNIVERSITY,
    });
  });

  // "You already applied" would confirm that an address has an application pending.
  it('resolves silently and stores nothing when a pending application exists', async () => {
    const { svc, applications, mail } = setup({ pendingExisting: application() });
    await expect(svc.submit(DTO as never)).resolves.toBeUndefined();
    expect(applications.save).not.toHaveBeenCalled();
    expect(mail.enqueue).not.toHaveBeenCalled();
  });

  // The loser of a concurrent double-submit: their application exists, just not this
  // copy. Indistinguishable from success on purpose.
  it('swallows the unique violation from a concurrent duplicate', async () => {
    const { svc } = setup({ saveError: { code: '23505' } });
    await expect(svc.submit(DTO as never)).resolves.toBeUndefined();
  });

  it('rethrows a database failure that is NOT a duplicate', async () => {
    const { svc } = setup({ saveError: { code: '23502' } });
    await expect(svc.submit(DTO as never)).rejects.toBeTruthy();
  });

  it('alerts every active superadmin with a review link', async () => {
    const { svc, mail } = setup({
      superAdmins: [{ email: 'a@codestack.dev' }, { email: 'b@codestack.dev' }],
    });
    await svc.submit(DTO as never);

    const alerts = mail.enqueue.mock.calls
      .map((c) => c[0] as { to: string; template: string; params: { reviewUrl: string } })
      .filter((m) => m.template === MailTemplate.ORG_APPLICATION_ALERT);
    expect(alerts.map((a) => a.to)).toEqual(['a@codestack.dev', 'b@codestack.dev']);
    expect(alerts[0].params.reviewUrl).toContain('organization-applications');
  });

  // An application nobody is told about is an institution that waits and gives up.
  it('still stores the application when no superadmin exists to alert', async () => {
    const { svc, applications } = setup({ superAdmins: [] });
    await expect(svc.submit(DTO as never)).resolves.toBeUndefined();
    expect(applications.save).toHaveBeenCalled();
  });
});

describe('OrganizationApplicationsService.approve', () => {
  const dto = {
    adminEmail: 'admin@acme.edu',
    maxProfessors: 10,
    maxStudents: 400,
    maxProblems: 200,
    maxAssignments: 100,
  };

  it('creates the organization from the application and returns it', async () => {
    const { svc, orgRepo } = setup();
    const outcome = await svc.approve('app-1', actor(), dto as never);

    expect(orgRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Acme University', slug: 'acme-university' }),
    );
    expect(outcome.organization.id).toBe('org-new');
    expect(outcome.adminEmail).toBe('admin@acme.edu');
  });

  // Both per-role caps are required by the DTO, so an approved tenant always has
  // deliberate limits — never an accidental unlimited one.
  it('writes both per-role seat caps inside the transaction', async () => {
    const { svc, quotas } = setup();
    await svc.approve('app-1', actor(), dto as never);

    expect(quotas.setLimit).toHaveBeenCalledWith(
      'org-new',
      QuotaResource.MAX_PROFESSORS,
      10,
      expect.anything(),
    );
    expect(quotas.setLimit).toHaveBeenCalledWith(
      'org-new',
      QuotaResource.MAX_STUDENTS,
      400,
      expect.anything(),
    );
  });

  /*
   * The content caps are required for the same reason the seat caps are: a tenant
   * created without them is unlimited by accident rather than by decision.
   *
   * Asserted on the VALUE, not just the resource — these arrived after the seat caps,
   * and the fixture that fed them was a `dto as never` cast, so the service happily
   * wrote `undefined` for a whole release's worth of green runs before this existed.
   */
  it('writes the content caps inside the transaction too', async () => {
    const { svc, quotas } = setup();
    await svc.approve('app-1', actor(), dto as never);

    expect(quotas.setLimit).toHaveBeenCalledWith(
      'org-new',
      QuotaResource.MAX_PROBLEMS,
      200,
      expect.anything(),
    );
    expect(quotas.setLimit).toHaveBeenCalledWith(
      'org-new',
      QuotaResource.MAX_ASSIGNMENTS,
      100,
      expect.anything(),
    );
  });

  // maxUsers is optional: absent means "bounded by the per-role caps only".
  it('omits the overall cap when none was given', async () => {
    const { svc, quotas } = setup();
    await svc.approve('app-1', actor(), dto as never);
    const resources = (quotas.setLimit as jest.Mock).mock.calls.map((c) => c[1]);
    expect(resources).not.toContain(QuotaResource.MAX_USERS);
  });

  it('writes the overall cap when one was given', async () => {
    const { svc, quotas } = setup();
    await svc.approve('app-1', actor(), { ...dto, maxUsers: 500 } as never);
    expect(quotas.setLimit).toHaveBeenCalledWith(
      'org-new',
      QuotaResource.MAX_USERS,
      500,
      expect.anything(),
    );
  });

  it('links the application to the organization it produced', async () => {
    const { svc, appRepoInTx } = setup();
    await svc.approve('app-1', actor(), dto as never);
    expect(appRepoInTx.update).toHaveBeenCalledWith({ id: 'app-1' }, { organizationId: 'org-new' });
  });

  /**
   * The returned application must carry the REVIEWER and the DATE.
   *
   * An earlier version spread the pre-flip row and patched two fields, so both stayed
   * null and the console rendered a freshly approved application with no reviewer until
   * someone refreshed. `reject()` always re-read; the asymmetry was the bug.
   */
  it('returns the post-flip row, with reviewer and timestamp populated', async () => {
    const { svc, appRepoInTx } = setup();
    const outcome = await svc.approve('app-1', actor(), dto as never);

    expect(appRepoInTx.findOneOrFail).toHaveBeenCalledWith({ where: { id: 'app-1' } });
    expect(outcome.application.reviewedById).toBe('sa-1');
    expect(outcome.application.reviewedAt).toBeInstanceOf(Date);
    expect(outcome.application.status).toBe(OrgApplicationStatus.APPROVED);
  });

  /**
   * The conditional flip. Two simultaneous approvals would otherwise both read a
   * pending row and both create an organization — two tenants for one institution.
   */
  it('refuses when the conditional status flip affects no row', async () => {
    const { svc } = setup({ flipAffected: 0 });
    await expect(svc.approve('app-1', actor(), dto as never)).rejects.toMatchObject({
      response: { reason: 'application_already_reviewed' },
    });
  });

  it('creates no organization when the flip is lost', async () => {
    const { svc, orgRepo } = setup({ flipAffected: 0 });
    await svc.approve('app-1', actor(), dto as never).catch(() => undefined);
    expect(orgRepo.save).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing application', { found: null }, NotFoundException],
    [
      'an already-approved application',
      { found: application({ status: OrgApplicationStatus.APPROVED }) },
      ConflictException,
    ],
    [
      'a rejected application',
      { found: application({ status: OrgApplicationStatus.REJECTED }) },
      ConflictException,
    ],
  ])('refuses %s', async (_label, opts, expected) => {
    const { svc } = setup(opts as Opts);
    await expect(svc.approve('app-1', actor(), dto as never)).rejects.toBeInstanceOf(expected);
  });
});

/**
 * The savepoint retry. Without a SAVEPOINT, Postgres aborts the whole transaction on
 * the first unique violation and every later statement fails with "current transaction
 * is aborted" — so the second approval of a similarly-named organization would not get
 * `acme-2`, it would fail outright.
 */
describe('OrganizationApplicationsService.approve — slug collisions', () => {
  const dto = {
    adminEmail: 'admin@acme.edu',
    maxProfessors: 1,
    maxStudents: 1,
    maxProblems: 1,
    maxAssignments: 1,
  };

  it('takes the bare slug when it is free', async () => {
    const { svc, orgRepo } = setup();
    await svc.approve('app-1', actor(), dto as never);
    expect((orgRepo.save as jest.Mock).mock.calls[0][0]).toMatchObject({ slug: 'acme-university' });
  });

  it('suffixes and succeeds when the bare slug is taken', async () => {
    const { svc, orgRepo } = setup({ slugConflicts: 1 });
    const outcome = await svc.approve('app-1', actor(), dto as never);

    const slugs = (orgRepo.save as jest.Mock).mock.calls.map(
      (c) => (c[0] as { slug: string }).slug,
    );
    expect(slugs).toEqual(['acme-university', 'acme-university-2']);
    expect(outcome.organization.slug).toBe('acme-university-2');
  });

  it('wraps each attempt in a savepoint and rolls back to it on conflict', async () => {
    const { svc, sql } = setup({ slugConflicts: 1 });
    await svc.approve('app-1', actor(), dto as never);

    expect(sql.filter((s) => s.includes('SAVEPOINT org_slug_attempt')).length).toBeGreaterThan(1);
    expect(sql.some((s) => s.startsWith('ROLLBACK TO SAVEPOINT'))).toBe(true);
    expect(sql.some((s) => s.startsWith('RELEASE SAVEPOINT'))).toBe(true);
  });

  it('gives up with a specific reason after too many collisions', async () => {
    const { svc } = setup({ slugConflicts: 99 });
    await expect(svc.approve('app-1', actor(), dto as never)).rejects.toMatchObject({
      response: { reason: 'slug_unavailable' },
    });
  });

  // A collision on some OTHER unique index is a real failure, not a slug problem —
  // retrying with a different slug would neither fix it nor report it.
  it('rethrows a non-slug database error without retrying', async () => {
    const { svc, orgRepo } = setup();
    (orgRepo.save as jest.Mock).mockRejectedValue({
      code: '23505',
      constraint: 'uq_org_invites_org_pending_email',
    });

    await expect(svc.approve('app-1', actor(), dto as never)).rejects.toBeTruthy();
    expect((orgRepo.save as jest.Mock).mock.calls).toHaveLength(1);
  });
});

describe('OrganizationApplicationsService.reject', () => {
  it('records the decision and mails the applicant with the reason', async () => {
    const { svc, mail } = setup();
    await svc.reject('app-1', actor(), 'Could not verify the institution');

    const msg = mail.enqueue.mock.calls[0][0] as {
      template: string;
      params: { reason: string | null };
    };
    expect(msg.template).toBe(MailTemplate.ORG_APPLICATION_REJECTED);
    expect(msg.params.reason).toBe('Could not verify the institution');
  });

  it('allows a rejection with no reason', async () => {
    const { svc, mail } = setup();
    await svc.reject('app-1', actor());
    const msg = mail.enqueue.mock.calls[0][0] as { params: { reason: string | null } };
    expect(msg.params.reason).toBeNull();
  });

  it('refuses when the conditional flip is lost', async () => {
    const { svc } = setup({ flipAffected: 0 });
    await expect(svc.reject('app-1', actor())).rejects.toMatchObject({
      response: { reason: 'application_already_reviewed' },
    });
  });
});

/**
 * When the contact IS the admin they already hold the invite, which carries the action.
 * A second mail about one event — one of which looks like it needs an action it does
 * not — is worse than silence.
 */
describe('OrganizationApplicationsService.notifyApproved', () => {
  it('tells the contact when they are not the administrator', async () => {
    const { svc, mail } = setup();
    await svc.notifyApproved({
      application: application(),
      organization: { id: 'org-new', name: 'Acme University' } as never,
      adminEmail: 'someone-else@acme.edu',
    });

    const msg = mail.enqueue.mock.calls[0][0] as { template: string };
    expect(msg.template).toBe(MailTemplate.ORG_APPLICATION_APPROVED);
  });

  it('stays silent when the contact IS the administrator', async () => {
    const { svc, mail } = setup();
    await svc.notifyApproved({
      application: application({ contactEmail: 'ada@acme.edu' }),
      organization: { id: 'org-new', name: 'Acme University' } as never,
      adminEmail: 'ADA@acme.edu',
    });

    expect(mail.enqueue).not.toHaveBeenCalled();
  });
});
