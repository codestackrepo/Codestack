import { ForbiddenException } from '@nestjs/common';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { Problem } from './entities/problem.entity';
import { ProblemScope, ProblemVisibility } from './enums/problem.enums';
import { ProblemsService } from './problems.service';

const actor = (role: Role, organizationId: string | null, id = 'me'): AuthenticatedUser => ({
  id,
  email: 'x@x.io',
  role,
  organizationId,
});

const makeProblem = (over: Partial<Problem> = {}): Problem =>
  ({
    id: 'p1',
    title: 't',
    body: 'b',
    scope: ProblemScope.ORG,
    visibility: ProblemVisibility.PRIVATE,
    organizationId: 'org-A',
    createdById: 'author',
    ...over,
  }) as Problem;

/** Service wired with a problems repo whose findOne returns `problem`. */
function buildService(problem: Problem | null) {
  const problems = {
    findOne: jest.fn().mockResolvedValue(problem),
    save: jest.fn(async (p: unknown) => p),
  };
  const noop = { find: jest.fn().mockResolvedValue([]) };
  const service = new ProblemsService(
    problems as never,
    noop as never, // testCases
    noop as never, // tags
    noop as never, // companies
    noop as never, // libraryTemplates
    {} as never, // dataSource
  );
  return { service, problems };
}

const publishedGlobal = makeProblem({
  scope: ProblemScope.GLOBAL,
  organizationId: null,
  visibility: ProblemVisibility.SHARED,
});
const globalDraft = makeProblem({
  scope: ProblemScope.GLOBAL,
  organizationId: null,
  visibility: ProblemVisibility.PRIVATE,
});
const orgAShared = makeProblem({
  organizationId: 'org-A',
  visibility: ProblemVisibility.SHARED,
  createdById: 'other',
});
const orgAPrivateOther = makeProblem({
  organizationId: 'org-A',
  visibility: ProblemVisibility.PRIVATE,
  createdById: 'other',
});
const orgBShared = makeProblem({
  organizationId: 'org-B',
  visibility: ProblemVisibility.SHARED,
  createdById: 'other',
});

const run = (a: AuthenticatedUser, p: Problem) => buildService(p).service.getVisible('p1', a);

describe('ProblemsService.getVisible — tier matrix (#56)', () => {
  it('superadmin sees everything incl. a global draft and another org’s private', async () => {
    await expect(run(actor(Role.SUPERADMIN, null), globalDraft)).resolves.toBeTruthy();
    await expect(run(actor(Role.SUPERADMIN, null), orgBShared)).resolves.toBeTruthy();
  });

  it('org admin: own-org (any visibility) + published global; NOT other-org, NOT global draft', async () => {
    const admin = actor(Role.ADMIN, 'org-A');
    await expect(run(admin, orgAPrivateOther)).resolves.toBeTruthy();
    await expect(run(admin, publishedGlobal)).resolves.toBeTruthy();
    await expect(run(admin, orgBShared)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(run(admin, globalDraft)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('professor: published global + own-org shared + own; NOT other-org / other-private / draft', async () => {
    const prof = actor(Role.PROFESSOR, 'org-A', 'me');
    const ownPrivate = makeProblem({
      organizationId: 'org-A',
      visibility: ProblemVisibility.PRIVATE,
      createdById: 'me',
    });
    await expect(run(prof, publishedGlobal)).resolves.toBeTruthy();
    await expect(run(prof, orgAShared)).resolves.toBeTruthy();
    await expect(run(prof, ownPrivate)).resolves.toBeTruthy();
    await expect(run(prof, orgBShared)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(run(prof, orgAPrivateOther)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(run(prof, globalDraft)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a null-org non-superadmin cannot reach a global via the org branch (draft stays hidden)', async () => {
    await expect(run(actor(Role.PROFESSOR, null, 'me'), globalDraft)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('ProblemsService.create — scope stamping (#56)', () => {
  function setup() {
    let created: Record<string, unknown> | undefined;
    const repo = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((o: Record<string, unknown>) => {
        created = o;
        return o;
      }),
      save: jest.fn(async (o: Record<string, unknown>) => ({ id: 'p1', ...o })),
    };
    const manager = { getRepository: jest.fn(() => repo) };
    const transaction = jest.fn(async (cb: (m: unknown) => Promise<unknown>) => cb(manager));
    const problems = { findOne: jest.fn().mockResolvedValue(makeProblem()) };
    const noop = { find: jest.fn().mockResolvedValue([]) };
    const service = new ProblemsService(
      problems as never,
      noop as never,
      noop as never,
      noop as never,
      noop as never,
      { transaction } as never,
    );
    return { service, transaction, getCreated: () => created };
  }

  it('professor create → scope=org, org=actor.org, visibility default shared', async () => {
    const { service, getCreated } = setup();
    await service.create({ title: 't', body: 'b' } as never, actor(Role.PROFESSOR, 'org-A'));
    expect(getCreated()).toMatchObject({
      scope: ProblemScope.ORG,
      organizationId: 'org-A',
      visibility: ProblemVisibility.SHARED,
    });
  });

  it('professor sending scope=global → ForbiddenException, no transaction', async () => {
    const { service, transaction } = setup();
    await expect(
      service.create(
        { title: 't', body: 'b', scope: ProblemScope.GLOBAL } as never,
        actor(Role.PROFESSOR, 'org-A'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('superadmin create → scope=global, org=null, visibility default private (draft)', async () => {
    const { service, getCreated } = setup();
    await service.create({ title: 't', body: 'b' } as never, actor(Role.SUPERADMIN, null));
    expect(getCreated()).toMatchObject({
      scope: ProblemScope.GLOBAL,
      organizationId: null,
      visibility: ProblemVisibility.PRIVATE,
    });
  });
});

describe('ProblemsService.update — assertOwnerOrAdmin bounding (#56)', () => {
  it('org-admin cannot modify another org’s problem', async () => {
    const { service } = buildService(makeProblem({ organizationId: 'org-B', createdById: 'other' }));
    await expect(service.update('p1', {} as never, actor(Role.ADMIN, 'org-A'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('org-admin cannot modify a GLOBAL problem', async () => {
    const { service } = buildService(
      makeProblem({ scope: ProblemScope.GLOBAL, organizationId: null, createdById: 'sa' }),
    );
    await expect(service.update('p1', {} as never, actor(Role.ADMIN, 'org-A'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('superadmin can modify a GLOBAL problem', async () => {
    const { service } = buildService(
      makeProblem({ scope: ProblemScope.GLOBAL, organizationId: null }),
    );
    await expect(service.update('p1', {} as never, actor(Role.SUPERADMIN, null))).resolves.toBeTruthy();
  });
});
