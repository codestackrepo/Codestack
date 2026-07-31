import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '../../../common/enums/role.enum';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { NotificationType } from '../../notifications/enums/notification-type.enum';
import { ProblemFeedbackService } from './problem-feedback.service';
import { ProblemFeedbackKind, ProblemFeedbackStatus } from './enums/problem-feedback.enums';

const student = (org: string | null = 'org-A'): AuthenticatedUser =>
  ({ id: 'u-stu', role: Role.STUDENT, organizationId: org }) as AuthenticatedUser;
const prof = (org: string | null = 'org-A'): AuthenticatedUser =>
  ({ id: 'u-prof', role: Role.PROFESSOR, organizationId: org }) as AuthenticatedUser;

describe('ProblemFeedbackService', () => {
  let repo: Record<string, jest.Mock>;
  let users: Record<string, jest.Mock>;
  let problems: Record<string, jest.Mock>;
  let notifications: Record<string, jest.Mock>;
  let qb: Record<string, jest.Mock>;
  let svc: ProblemFeedbackService;

  const setup = (opts: { updateAffected?: number; found?: unknown } = {}) => {
    qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getOne: jest.fn().mockResolvedValue(opts.found ?? null),
      // update-builder chain
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: opts.updateAffected ?? 1 }),
    };
    repo = {
      createQueryBuilder: jest.fn(() => qb),
      create: jest.fn((d: unknown) => d),
      save: jest.fn((d: Record<string, unknown>) => Promise.resolve({ id: 'f-1', ...d })),
      findOneOrFail: jest.fn().mockResolvedValue({ id: 'f-1', problemId: 'p-1' }),
    };
    users = { find: jest.fn().mockResolvedValue([]) };
    // Visibility is ProblemsService's job; this mock stands in for "the actor may
    // see it" and the reject case stands in for "they may not".
    problems = { getVisible: jest.fn().mockResolvedValue({ id: 'p-1', title: 'Two Sum' }) };
    notifications = { createForRecipients: jest.fn().mockResolvedValue([]) };
    svc = new ProblemFeedbackService(
      repo as never,
      users as never,
      problems as never,
      notifications as never,
    );
  };

  const body = { kind: ProblemFeedbackKind.DOUBT, body: 'why does this fail?' };

  describe('create', () => {
    it('anchors organization_id to the AUTHOR, not the problem', async () => {
      setup();
      // A GLOBAL problem: organizationId null. Inheriting it would strand the row
      // in a tenant scopeToOrg can never match.
      problems.getVisible.mockResolvedValue({ id: 'p-1', title: 'Global', organizationId: null });

      await svc.create('p-1', body, student('org-A'));

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-A', authorId: 'u-stu' }),
      );
    });

    it('refuses an org-less actor rather than writing a null tenant', async () => {
      setup();
      await expect(svc.create('p-1', body, student(null))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('delegates visibility to ProblemsService and writes nothing when denied', async () => {
      setup();
      problems.getVisible.mockRejectedValue(new NotFoundException());
      await expect(svc.create('p-1', body, student())).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('fans a DOUBT out to the org staff only, excluding the author', async () => {
      setup();
      users.find.mockResolvedValue([
        { id: 'u-admin', role: Role.ADMIN },
        { id: 'u-prof', role: Role.PROFESSOR },
        { id: 'u-other-stu', role: Role.STUDENT }, // must not be notified
      ]);

      await svc.create('p-1', body, student());

      expect(notifications.createForRecipients).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientIds: ['u-admin', 'u-prof'],
          type: NotificationType.PROBLEM_FEEDBACK_RECEIVED,
          actorId: 'u-stu',
        }),
      );
      // The recipient query is keyed on the FEEDBACK's org — the author's — which is
      // what routes a global-problem doubt to the student's own staff.
      expect(users.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-A', isActive: true } }),
      );
    });

    it('does NOT fan out an issue or a suggestion', async () => {
      setup();
      users.find.mockResolvedValue([{ id: 'u-prof', role: Role.PROFESSOR }]);
      await svc.create('p-1', { kind: ProblemFeedbackKind.ISSUE, body: 'typo' }, student());
      expect(notifications.createForRecipients).not.toHaveBeenCalled();
    });

    it('still returns successfully when the notification fan-out throws', async () => {
      setup();
      users.find.mockResolvedValue([{ id: 'u-prof', role: Role.PROFESSOR }]);
      notifications.createForRecipients.mockRejectedValue(new Error('redis down'));
      // The row is already committed; a notification failure must not become a 500
      // on a write that succeeded.
      await expect(svc.create('p-1', body, student())).resolves.toBeDefined();
    });
  });

  describe('resolve', () => {
    const open = {
      id: 'f-1',
      problemId: 'p-1',
      authorId: 'u-stu',
      status: ProblemFeedbackStatus.OPEN,
      problem: { title: 'Two Sum' },
    };

    it('404s an id outside the actor org, revealing nothing', async () => {
      setup({ found: null }); // scoped read misses
      await expect(svc.resolve('f-1', {}, prof())).rejects.toBeInstanceOf(NotFoundException);
      expect(qb.execute).not.toHaveBeenCalled();
    });

    it('transitions with a conditional UPDATE guarded on status=open', async () => {
      setup({ found: open });
      await svc.resolve('f-1', { resolutionNote: 'answered in class' }, prof());

      expect(qb.where).toHaveBeenCalledWith(
        'id = :id AND status = :open',
        expect.objectContaining({ open: ProblemFeedbackStatus.OPEN }),
      );
      expect(qb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ProblemFeedbackStatus.RESOLVED,
          resolvedById: 'u-prof',
          resolutionNote: 'answered in class',
        }),
      );
    });

    it('rejects a lost race instead of reporting the wrong resolver', async () => {
      // affected 0 = another staff member resolved it between the read and the write.
      setup({ found: open, updateAffected: 0 });
      await expect(svc.resolve('f-1', {}, prof())).rejects.toMatchObject({
        response: { reason: 'feedback_not_open' },
      });
      expect(notifications.createForRecipients).not.toHaveBeenCalled();
    });

    it('notifies the AUTHOR, passing actorId so a self-resolve notifies nobody', async () => {
      setup({ found: open });
      await svc.resolve('f-1', {}, prof());
      expect(notifications.createForRecipients).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientIds: ['u-stu'],
          type: NotificationType.PROBLEM_FEEDBACK_RESOLVED,
          actorId: 'u-prof',
        }),
      );
    });
  });

  describe('listForProblem', () => {
    it('narrows a STUDENT to their own rows', async () => {
      setup();
      await svc.listForProblem('p-1', student());
      expect(qb.andWhere).toHaveBeenCalledWith('f.authorId = :self', { self: 'u-stu' });
    });

    it('does NOT narrow staff', async () => {
      setup();
      await svc.listForProblem('p-1', prof());
      const calls = qb.andWhere.mock.calls.map((c) => String(c[0]));
      expect(calls.some((c) => c.includes('authorId = :self'))).toBe(false);
    });
  });
});
