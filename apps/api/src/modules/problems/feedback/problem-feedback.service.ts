import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../../../common/enums/role.enum';
import { scopeToOrg } from '../../../common/tenancy/tenant-scope.util';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { NotificationType } from '../../notifications/enums/notification-type.enum';
import { NotificationsService } from '../../notifications/notifications.service';
import { User } from '../../users/entities/user.entity';
import { ProblemsService } from '../problems.service';
import {
  CreateProblemFeedbackDto,
  QueryProblemFeedbackDto,
  ResolveProblemFeedbackDto,
} from './dto/problem-feedback.dto';
import { ProblemFeedback } from './entities/problem-feedback.entity';
import { ProblemFeedbackKind, ProblemFeedbackStatus } from './enums/problem-feedback.enums';

const STAFF_ROLES = [Role.ADMIN, Role.PROFESSOR];

@Injectable()
export class ProblemFeedbackService {
  private readonly logger = new Logger(ProblemFeedbackService.name);

  constructor(
    @InjectRepository(ProblemFeedback)
    private readonly repo: Repository<ProblemFeedback>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly problems: ProblemsService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Raise feedback against a problem.
   *
   * `problems.getVisible` is the authorization, not a convenience read: it is the
   * SAME predicate the catalog list uses (#56), so an actor can only comment on a
   * problem they could already see. Re-deriving visibility here would be a second
   * copy of a rule that exists to have exactly one.
   */
  async create(
    problemId: string,
    dto: CreateProblemFeedbackDto,
    actor: AuthenticatedUser,
  ): Promise<ProblemFeedback> {
    const problem = await this.problems.getVisible(problemId, actor);

    // A SUPERADMIN has no org, and this table's org column is NOT NULL by design
    // (it anchors the whole tenancy story — see the migration header). Rather than
    // relax the column, the platform role simply has no feedback to give: they
    // author the global catalog, they do not raise doubts inside a tenant.
    if (!actor.organizationId) {
      throw new ForbiddenException({
        reason: 'no_organization',
        message: 'Feedback is raised inside an organization',
      });
    }

    const saved = await this.repo.save(
      this.repo.create({
        problemId: problem.id,
        authorId: actor.id,
        // The AUTHOR's org. For a global problem `problem.organizationId` is null,
        // and using it would strand the row in an unreachable tenant.
        organizationId: actor.organizationId,
        kind: dto.kind,
        body: dto.body,
        status: ProblemFeedbackStatus.OPEN,
      }),
    );

    await this.notifyStaff(saved, problem.title, actor);
    return this.getWithRelations(saved.id);
  }

  /**
   * The per-problem thread.
   *
   * Staff see their org's feedback on this problem; a student sees only their own.
   * A student reading a peer's doubt is not obviously harmful, but it is not asked
   * for either, and a doubt often quotes the reader's own wrong approach — so the
   * narrow rule is the default until a product decision widens it.
   */
  async listForProblem(problemId: string, actor: AuthenticatedUser): Promise<ProblemFeedback[]> {
    await this.problems.getVisible(problemId, actor); // same gate as create
    const qb = this.baseQuery(actor).andWhere('f.problemId = :problemId', { problemId });
    if (!this.isStaff(actor)) qb.andWhere('f.authorId = :self', { self: actor.id });
    return qb.orderBy('f.createdAt', 'DESC').getMany();
  }

  /** The staff doubts inbox: `GET /feedback?status=open`. */
  async listInbox(
    query: QueryProblemFeedbackDto,
    actor: AuthenticatedUser,
  ): Promise<ProblemFeedback[]> {
    const qb = this.baseQuery(actor);
    if (query.status) qb.andWhere('f.status = :status', { status: query.status });
    if (query.kind) qb.andWhere('f.kind = :kind', { kind: query.kind });
    if (query.problemId) qb.andWhere('f.problemId = :pid', { pid: query.problemId });
    return qb.orderBy('f.createdAt', 'DESC').take(200).getMany();
  }

  /**
   * Resolve an open item. Staff only (enforced by `@Roles` on the route).
   *
   * The conditional UPDATE plus `affected === 1` is the single-transition control,
   * the same shape the invite consume and the password-reset consume use. A
   * read-then-write would let two staff resolving the same doubt both pass the
   * status check, and the second would silently overwrite the first's note.
   */
  async resolve(
    id: string,
    dto: ResolveProblemFeedbackDto,
    actor: AuthenticatedUser,
  ): Promise<ProblemFeedback> {
    // Scoped read first, so a cross-org id is a 404 rather than a leak that it
    // exists. `scopeToOrg` is what makes this uniform.
    const found = await this.baseQuery(actor).andWhere('f.id = :id', { id }).getOne();
    if (!found) throw new NotFoundException({ reason: 'feedback_not_found' });

    const result = await this.repo
      .createQueryBuilder()
      .update(ProblemFeedback)
      .set({
        status: ProblemFeedbackStatus.RESOLVED,
        resolvedById: actor.id,
        resolvedAt: () => 'now()',
        resolutionNote: dto.resolutionNote ?? null,
        updatedAt: () => 'now()',
      })
      .where('id = :id AND status = :open', { id, open: ProblemFeedbackStatus.OPEN })
      .execute();

    if (result.affected !== 1) {
      // Already resolved by someone else. Reported as a conflict rather than
      // silently returning the row, so the UI can refresh instead of showing this
      // actor as the resolver when they were not.
      throw new ForbiddenException({
        reason: 'feedback_not_open',
        message: 'This feedback has already been resolved',
      });
    }

    await this.notifyAuthorResolved(found, actor);
    return this.getWithRelations(id);
  }

  // ------------------------------------------------------------------ helpers

  private isStaff(actor: AuthenticatedUser): boolean {
    return actor.role === Role.ADMIN || actor.role === Role.PROFESSOR;
  }

  /**
   * Every read starts here. `scopeToOrg` on the feedback's own `organization_id`
   * — the author's org — is the single tenancy choke point for this table.
   *
   * Callers use PROPERTY names (`f.problemId`), never raw columns (`f.problem_id`).
   * `take()` makes TypeORM build a distinct-id subquery and resolve `orderBy`
   * through entity metadata, and a raw column name has no metadata entry — it dies
   * with `Cannot read properties of undefined (reading 'databaseName')`, a 500
   * rather than a SQL error, and ONLY on the paged query, so the un-paged thread
   * looks fine while the inbox breaks. `scopeToOrg` emits
   * `<alias>.organizationId` anyway, so property names are the convention here.
   */
  private baseQuery(actor: AuthenticatedUser) {
    const qb = this.repo
      .createQueryBuilder('f')
      .leftJoinAndSelect('f.problem', 'problem')
      .leftJoinAndSelect('f.author', 'author')
      .leftJoinAndSelect('f.resolvedBy', 'resolvedBy');
    return scopeToOrg(qb, 'f', actor);
  }

  private getWithRelations(id: string): Promise<ProblemFeedback> {
    return this.repo.findOneOrFail({
      where: { id },
      relations: { problem: true, author: true, resolvedBy: true },
    });
  }

  /**
   * Fan out to the AUTHOR'S OWN org staff.
   *
   * This is the routing rule the issue calls out: a doubt on a GLOBAL problem goes
   * to the student's staff, not to whoever authored the platform problem. The
   * recipients come from `problem_feedback.organization_id`, so global and org
   * problems take the identical path and there is no branch to get wrong.
   *
   * Only DOUBT fans out. An issue or a suggestion is about the problem's quality
   * and belongs in the inbox, but it is not somebody waiting on an answer — paging
   * every professor for a typo report is how staff learn to ignore notifications.
   */
  private async notifyStaff(
    feedback: ProblemFeedback,
    problemTitle: string,
    actor: AuthenticatedUser,
  ): Promise<void> {
    if (feedback.kind !== ProblemFeedbackKind.DOUBT) return;

    const staff = await this.users.find({
      where: { organizationId: feedback.organizationId, isActive: true },
      select: { id: true, role: true },
    });
    const recipientIds = staff.filter((u) => STAFF_ROLES.includes(u.role)).map((u) => u.id);
    if (!recipientIds.length) return;

    // Never throws: the feedback row is already committed, and a notification
    // failure must not turn a successful write into a 500 the client will retry.
    try {
      await this.notifications.createForRecipients({
        recipientIds,
        actorId: actor.id,
        type: NotificationType.PROBLEM_FEEDBACK_RECEIVED,
        title: `New doubt: ${problemTitle}`,
        message: `A student raised a doubt on "${problemTitle}".`,
        entityType: 'problem_feedback',
        entityId: feedback.id,
        link: '/home/feedback',
      });
    } catch (err) {
      this.logger.error(
        `Feedback ${feedback.id} saved but staff notification failed: ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async notifyAuthorResolved(
    feedback: ProblemFeedback,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const title = feedback.problem?.title ?? 'a problem';
    try {
      await this.notifications.createForRecipients({
        recipientIds: [feedback.authorId],
        actorId: actor.id, // a staff member resolving their own item notifies nobody
        type: NotificationType.PROBLEM_FEEDBACK_RESOLVED,
        title: `Your feedback was resolved: ${title}`,
        message: `Staff resolved your feedback on "${title}".`,
        entityType: 'problem_feedback',
        entityId: feedback.id,
        link: `/home/problems/${feedback.problemId}`,
      });
    } catch (err) {
      this.logger.error(
        `Feedback ${feedback.id} resolved but author notification failed: ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
