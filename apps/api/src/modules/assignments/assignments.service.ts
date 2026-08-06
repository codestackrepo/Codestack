import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  ASSIGNMENT_GRADES_PUBLISHED,
  ASSIGNMENT_PROBLEM_ADDED,
  ASSIGNMENT_PUBLISHED,
  AssignmentGradesPublishedEvent,
  AssignmentProblemAddedEvent,
  AssignmentPublishedEvent,
} from '../../common/events/notification-events';
import { PaginatedResult } from '../../common/dto/pagination.dto';
import { Language } from '../../common/enums/language.enum';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { assertSameOrg, isSuperAdmin, scopeToOrg } from '../../common/tenancy/tenant-scope.util';
import { ClassroomsService } from '../classrooms/classrooms.service';
import { ProblemsService } from '../problems/problems.service';
import { Batch } from '../classrooms/entities/batch.entity';
import { Classroom } from '../classrooms/entities/classroom.entity';
import { LibraryProblemTemplate } from '../problems/entities/library-problem-template.entity';
import { Problem } from '../problems/entities/problem.entity';
import { TestCase } from '../problems/entities/test-case.entity';
import { ProblemScope, ProblemSource, ProblemVisibility } from '../problems/enums/problem.enums';
import { QuotaResource } from '../quotas/enums/quota-resource.enum';
import { QuotaService } from '../quotas/quota.service';
import {
  CloneProblemDto,
  CreateAssignmentDto,
  EditAssignmentProblemDto,
  ImportProblemDto,
  QueryAssignmentsDto,
  UpdateAssignmentDto,
} from './dto/assignment.dto';
import { syncCodingPoints } from './coding-points.util';
import { AssignmentAttempt } from './entities/assignment-attempt.entity';
import { AssignmentProblem } from './entities/assignment-problem.entity';
import { Assignment } from './entities/assignment.entity';
import { ProblemTemplate } from './entities/problem-template.entity';
import { AssignmentKind } from './enums/assignment-kind.enum';
import { AssignmentStatus, VISIBLE_TO_STUDENTS } from './enums/assignment-status.enum';
import { AssignmentTargetType } from './enums/assignment-target-type.enum';
import { AttemptStatus } from './enums/attempt-status.enum';

/**
 * What the solve editor bootstraps from: the problem, the assignment it belongs
 * to, and — for a timed test only — the caller's own attempt, so the editor can
 * render the same server-anchored clock the take page does (#145).
 */
export interface EditorBootstrapView {
  ap: AssignmentProblem;
  assignment: Assignment;
  attempt: AssignmentAttempt | null;
}

@Injectable()
export class AssignmentsService {
  /**
   * The batch-targeting visibility predicate (§9.10): an assignment `a` is
   * batch-visible to `:uid` iff it targets the whole classroom, or the user is
   * a member of at least one of its target batches. Shared by the three query
   * sites (findAll, myActiveDeadlines) so they can't drift.
   */
  private static readonly BATCH_VISIBLE_SQL = `a.target_type = 'classroom' OR EXISTS (
    SELECT 1 FROM assignment_target_batches atb
    JOIN batch_students bs ON bs.batch_id = atb.batch_id
    WHERE atb.assignment_id = a.id AND bs.user_id = :uid)`;

  constructor(
    @InjectRepository(Assignment) private readonly assignments: Repository<Assignment>,
    @InjectRepository(AssignmentProblem)
    private readonly assignmentProblems: Repository<AssignmentProblem>,
    @InjectRepository(ProblemTemplate) private readonly templates: Repository<ProblemTemplate>,
    @InjectRepository(TestCase) private readonly testCases: Repository<TestCase>,
    @InjectRepository(LibraryProblemTemplate)
    private readonly libraryTemplates: Repository<LibraryProblemTemplate>,
    @InjectRepository(Batch) private readonly batches: Repository<Batch>,
    @InjectRepository(AssignmentAttempt)
    private readonly attempts: Repository<AssignmentAttempt>,
    private readonly classroomsService: ClassroomsService,
    private readonly dataSource: DataSource,
    private readonly emitter: EventEmitter2,
    private readonly problemsService: ProblemsService,
    private readonly quotas: QuotaService,
  ) {}

  async create(dto: CreateAssignmentDto, actor: AuthenticatedUser): Promise<Assignment> {
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (start >= end) throw new BadRequestException('startDate must be before endDate');

    const classroom = await this.classroomsService.getDetail(dto.classroomId);
    this.assertCanManage(actor, classroom);

    const targeting = await this.resolveTargeting(
      dto.classroomId,
      dto,
      actor,
      classroom.organizationId,
    );

    // WRAPPED IN A TRANSACTION for #66: this path was a bare save(), and a quota
    // check outside a transaction releases its row lock immediately, making the
    // limit advisory. Validation and targeting resolution stay OUTSIDE the tx so
    // the seat lock is held only for the check plus the insert.
    return this.assignments.manager.transaction(async (manager) => {
      await this.quotas.assertWithinQuota(
        // The classroom's org, matching the row we're about to stamp — never the
        // actor's, or a SuperAdmin acting on a tenant would dodge that org's cap.
        classroom.organizationId,
        QuotaResource.MAX_ASSIGNMENTS,
        1,
        manager,
      );
      const repo = manager.getRepository(Assignment);
      return repo.save(
        repo.create({
          title: dto.title,
          description: dto.description ?? '',
          startDate: start,
          endDate: end,
          classroomId: dto.classroomId,
          // Denormalized org = the classroom's org (canonical parent), not the actor.
          organizationId: classroom.organizationId,
          createdById: actor.id,
          status: dto.asDraft ? AssignmentStatus.DRAFT : AssignmentStatus.SCHEDULED,
          kind: targeting.kind,
          targetType: targeting.targetType,
          durationMinutes: targeting.durationMinutes,
          targetBatches: targeting.targetBatches,
        }),
      );
    });
  }

  /**
   * Validates + resolves kind/targeting for create/update:
   * - `kind=test` requires `durationMinutes >= 1`.
   * - `targetType=batch` requires ≥1 target batch, every one belonging to the
   *   assignment's classroom (so a professor can't target another class's batch).
   */
  private async resolveTargeting(
    classroomId: string,
    input: {
      kind?: AssignmentKind;
      targetType?: AssignmentTargetType;
      durationMinutes?: number | null;
      targetBatchIds?: string[];
    },
    actor: AuthenticatedUser,
    orgId: string,
  ): Promise<{
    kind: AssignmentKind;
    targetType: AssignmentTargetType;
    durationMinutes: number | null;
    targetBatches: Batch[];
  }> {
    const kind = input.kind ?? AssignmentKind.ASSIGNMENT;
    const targetType = input.targetType ?? AssignmentTargetType.CLASSROOM;
    const durationMinutes = input.durationMinutes ?? null;

    if (kind === AssignmentKind.TEST && (durationMinutes === null || durationMinutes < 1)) {
      throw new BadRequestException('durationMinutes (>= 1) is required when kind=test');
    }

    let targetBatches: Batch[] = [];
    if (targetType === AssignmentTargetType.BATCH) {
      const ids = [...new Set(input.targetBatchIds ?? [])];
      if (!ids.length) {
        throw new BadRequestException(
          'targetBatchIds must contain at least one batch when targetType=batch',
        );
      }
      targetBatches = await this.batches.find({ where: { id: In(ids), classroomId } });
      if (targetBatches.length !== ids.length) {
        throw new BadRequestException('One or more target batches do not belong to this classroom');
      }
      assertSameOrg(actor, orgId); // defense-in-depth over the classroomId subset check
    }
    return { kind, targetType, durationMinutes, targetBatches };
  }

  async findAll(
    query: QueryAssignmentsDto,
    actor: AuthenticatedUser,
  ): Promise<PaginatedResult<Assignment>> {
    const qb = this.assignments
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.targetBatches', 'tb')
      .orderBy('a.createdAt', 'DESC');
    if (query.classroomId) qb.andWhere('a.classroom_id = :cid', { cid: query.classroomId });

    if (actor.role === Role.PROFESSOR) {
      qb.andWhere(
        `(a.created_by_id = :uid OR EXISTS (
            SELECT 1 FROM classrooms c WHERE c.id = a.classroom_id
            AND (c.created_by_id = :uid OR c.professor_id = :uid)))`,
        { uid: actor.id },
      );
    } else if (actor.role === Role.STUDENT) {
      // Site #1 of the three-site batch filter (§9.10). Graders (role=student)
      // stay exempt: they see every visible assignment in their classroom;
      // plain enrolled students only see classroom-targeted assignments plus
      // batch-targeted ones whose target batches they belong to.
      qb.andWhere(
        `a.status IN (:...visible) AND EXISTS (
           SELECT 1 FROM classrooms c WHERE c.id = a.classroom_id AND (
             EXISTS (SELECT 1 FROM classroom_graders cg WHERE cg.classroom_id = c.id AND cg.user_id = :uid)
             OR (
               EXISTS (SELECT 1 FROM classroom_students cs WHERE cs.classroom_id = c.id AND cs.user_id = :uid)
               AND (${AssignmentsService.BATCH_VISIBLE_SQL})
             )))`,
        { uid: actor.id, visible: VISIBLE_TO_STUDENTS },
      );
    }

    scopeToOrg(qb, 'a', actor);

    const [rows, total] = await qb.skip(query.skip).take(query.limit).getManyAndCount();
    await this.refreshStatuses(rows);
    return PaginatedResult.of(rows, total, query);
  }

  async getById(id: string): Promise<Assignment> {
    const assignment = await this.assignments.findOne({
      where: { id },
      relations: { targetBatches: true },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    if (await this.refreshStatuses([assignment])) {
      // reload to reflect persisted status
      return this.assignments.findOneOrFail({ where: { id }, relations: { targetBatches: true } });
    }
    return assignment;
  }

  async findOne(id: string, actor: AuthenticatedUser): Promise<Assignment> {
    const assignment = await this.getById(id);
    await this.assertCanView(actor, assignment);
    return assignment;
  }

  async update(
    id: string,
    dto: UpdateAssignmentDto,
    actor: AuthenticatedUser,
  ): Promise<Assignment> {
    const assignment = await this.getById(id);
    await this.assertCanManageAssignment(actor, assignment);
    if (dto.title !== undefined) assignment.title = dto.title;
    if (dto.description !== undefined) assignment.description = dto.description;
    if (dto.startDate) assignment.startDate = new Date(dto.startDate);
    if (dto.endDate) assignment.endDate = new Date(dto.endDate);

    // Re-resolve kind/targeting only if any targeting field was supplied,
    // merging with the assignment's current values so a partial update (e.g.
    // switching to targetType=batch) still validates against the full picture.
    if (
      dto.kind !== undefined ||
      dto.targetType !== undefined ||
      dto.durationMinutes !== undefined ||
      dto.targetBatchIds !== undefined
    ) {
      const targeting = await this.resolveTargeting(
        assignment.classroomId,
        {
          kind: dto.kind ?? assignment.kind,
          targetType: dto.targetType ?? assignment.targetType,
          durationMinutes: dto.durationMinutes ?? assignment.durationMinutes,
          targetBatchIds: dto.targetBatchIds ?? (assignment.targetBatches ?? []).map((b) => b.id),
        },
        actor,
        assignment.organizationId,
      );
      assignment.kind = targeting.kind;
      assignment.targetType = targeting.targetType;
      assignment.durationMinutes = targeting.durationMinutes;
      assignment.targetBatches = targeting.targetBatches;
    }
    return this.assignments.save(assignment);
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    const assignment = await this.getById(id);
    await this.assertCanManageAssignment(actor, assignment);
    await this.assignments.remove(assignment);
  }

  // ---- status actions ----

  async publish(id: string, actor: AuthenticatedUser): Promise<Assignment> {
    const a = await this.transition(id, actor, AssignmentStatus.DRAFT, AssignmentStatus.ACTIVE);
    a.publishedAt = new Date();
    const saved = await this.assignments.save(a);
    // DRAFT → ACTIVE is the moment the assignment first becomes student-visible.
    this.emitter.emit(ASSIGNMENT_PUBLISHED, {
      assignmentId: saved.id,
      classroomId: saved.classroomId,
      title: saved.title,
      actorId: actor.id,
      studentRecipientIds: await this.resolveNotificationStudentIds(saved),
    } satisfies AssignmentPublishedEvent);
    return saved;
  }

  complete(id: string, actor: AuthenticatedUser): Promise<Assignment> {
    return this.transition(id, actor, AssignmentStatus.ACTIVE, AssignmentStatus.COMPLETED).then(
      (a) => this.assignments.save(a),
    );
  }

  async publishGrades(id: string, actor: AuthenticatedUser): Promise<Assignment> {
    const a = await this.transition(
      id,
      actor,
      AssignmentStatus.COMPLETED,
      AssignmentStatus.GRADE_PUBLISHED,
    );
    const saved = await this.assignments.save(a);
    this.emitter.emit(ASSIGNMENT_GRADES_PUBLISHED, {
      assignmentId: saved.id,
      classroomId: saved.classroomId,
      title: saved.title,
      actorId: actor.id,
      studentRecipientIds: await this.resolveNotificationStudentIds(saved),
    } satisfies AssignmentGradesPublishedEvent);
    return saved;
  }

  /**
   * For batch-targeted assignments, the deduped union of target-batch member
   * ids (the only students who should be notified); `undefined` for
   * classroom-targeted assignments (the listener then falls back to notifying
   * every enrolled student). Graders are unioned in by the listener.
   */
  private async resolveNotificationStudentIds(
    assignment: Assignment,
  ): Promise<string[] | undefined> {
    if (assignment.targetType !== AssignmentTargetType.BATCH) return undefined;
    const rows: Array<{ user_id: string }> = await this.dataSource.query(
      `SELECT DISTINCT bs.user_id AS user_id FROM assignment_target_batches atb
         JOIN batch_students bs ON bs.batch_id = atb.batch_id
         WHERE atb.assignment_id = $1`,
      [assignment.id],
    );
    return rows.map((r) => r.user_id);
  }

  private async transition(
    id: string,
    actor: AuthenticatedUser,
    from: AssignmentStatus,
    to: AssignmentStatus,
  ): Promise<Assignment> {
    const assignment = await this.getById(id);
    await this.assertCanManageAssignment(actor, assignment);
    if (assignment.status !== from) {
      throw new BadRequestException(`Assignment must be '${from}' to become '${to}'`);
    }
    assignment.status = to;
    return assignment;
  }

  // ---- problem attachment ----

  async getAssignmentProblems(id: string, actor: AuthenticatedUser): Promise<AssignmentProblem[]> {
    await this.findOne(id, actor); // view permission + status visibility
    return this.assignmentProblems.find({
      where: { assignmentId: id },
      relations: { problem: { tags: true }, languageTemplates: true },
      order: { createdAt: 'ASC' },
    });
  }

  async importProblem(
    assignmentId: string,
    dto: ImportProblemDto,
    actor: AuthenticatedUser,
  ): Promise<AssignmentProblem> {
    const assignment = await this.getById(assignmentId);
    await this.assertCanManageAssignment(actor, assignment);

    // #57: gated read — getVisible throws 404/403 (was an ungated raw lookup
    // that leaked any problem by id across users/tenants).
    const source = await this.problemsService.getVisible(dto.sourceProblemId, actor);

    const dup = await this.assignmentProblems.findOne({
      where: { assignmentId, problemId: source.id },
    });
    if (dup) throw new BadRequestException('Problem already attached to this assignment');

    const apId = await this.dataSource.transaction((m) =>
      this.attachProblem(m, assignment.id, source.id, dto.score, dto.languages, true),
    );
    const ap = await this.getAssignmentProblem(apId);
    await this.notifyProblemAdded(assignment, ap, actor.id);
    return ap;
  }

  async cloneProblem(
    assignmentId: string,
    dto: CloneProblemDto,
    actor: AuthenticatedUser,
  ): Promise<AssignmentProblem> {
    const assignment = await this.getById(assignmentId);
    await this.assertCanManageAssignment(actor, assignment);

    // #57: gated read (getVisible eager-loads tags/companies; clone only reads
    // source.difficulty/id below, so behavior is preserved).
    const source = await this.problemsService.getVisible(dto.sourceProblemId, actor);
    const activeCases = await this.testCases.find({
      where: { problemId: source.id, isActive: true },
    });

    const apId = await this.dataSource.transaction(async (m) => {
      const cloned = m.getRepository(Problem).create({
        title: dto.problem.title,
        body: dto.problem.body,
        difficulty: dto.problem.difficulty ?? source.difficulty,
        visibility: ProblemVisibility.PRIVATE,
        // Clone lands as an org-private copy in the assignment's tenant (#57).
        scope: ProblemScope.ORG,
        organizationId: actor.organizationId ?? assignment.organizationId,
        source: ProblemSource.HUMAN,
        createdById: actor.id,
      });
      const savedProblem = await m.getRepository(Problem).save(cloned);
      if (activeCases.length) {
        await m.getRepository(TestCase).save(
          activeCases.map((tc) =>
            m.getRepository(TestCase).create({
              problemId: savedProblem.id,
              inputData: tc.inputData,
              expectedOutput: tc.expectedOutput,
              type: tc.type,
              explanation: tc.explanation,
              isActive: tc.isActive,
              orderIndex: tc.orderIndex,
            }),
          ),
        );
      }
      // Templates copied from the SOURCE problem's library templates.
      return this.attachProblem(
        m,
        assignment.id,
        savedProblem.id,
        dto.score,
        dto.languages,
        false,
        source.id,
      );
    });
    const ap = await this.getAssignmentProblem(apId);
    await this.notifyProblemAdded(assignment, ap, actor.id);
    return ap;
  }

  /**
   * Notify enrolled students/graders when a problem is added to an assignment
   * they can already see. DRAFT/SCHEDULED attachments notify no one (the
   * assignment isn't visible yet — the publish event covers that later).
   */
  private async notifyProblemAdded(
    assignment: Assignment,
    ap: AssignmentProblem,
    actorId: string,
  ): Promise<void> {
    if (!VISIBLE_TO_STUDENTS.includes(assignment.status)) return;
    this.emitter.emit(ASSIGNMENT_PROBLEM_ADDED, {
      assignmentId: assignment.id,
      assignmentProblemId: ap.id,
      classroomId: assignment.classroomId,
      assignmentTitle: assignment.title,
      problemTitle: ap.problem?.title ?? 'A new problem',
      actorId,
      studentRecipientIds: await this.resolveNotificationStudentIds(assignment),
    } satisfies AssignmentProblemAddedEvent);
  }

  async editAssignmentProblem(
    apId: string,
    dto: EditAssignmentProblemDto,
    actor: AuthenticatedUser,
  ): Promise<AssignmentProblem> {
    const ap = await this.getAssignmentProblem(apId);
    const assignment = await this.getById(ap.assignmentId);
    await this.assertCanManageAssignment(actor, assignment);

    // Keep AssignmentProblem.score and the wrapping AssignmentItem.maxPoints in
    // lockstep via the shared helper (issue #20) so the two never drift.
    if (dto.score !== undefined) {
      await syncCodingPoints(this.dataSource.manager, ap.id, dto.score);
    }

    if (dto.languages) {
      await this.reconcileTemplates(ap, dto.languages);
    }
    return this.getAssignmentProblem(apId);
  }

  /**
   * Public manage-gate for sibling services (assignment-items / taking): loads
   * the assignment and asserts the actor may manage it (staff/grader). Throws
   * NotFound/Forbidden as appropriate. Returns the loaded assignment.
   */
  async assertCanManageById(assignmentId: string, actor: AuthenticatedUser): Promise<Assignment> {
    const assignment = await this.getById(assignmentId);
    await this.assertCanManageAssignment(actor, assignment);
    return assignment;
  }

  async deleteAssignmentProblem(apId: string, actor: AuthenticatedUser): Promise<void> {
    const ap = await this.getAssignmentProblem(apId);
    const assignment = await this.getById(ap.assignmentId);
    await this.assertCanManageAssignment(actor, assignment);
    await this.assignmentProblems.remove(ap);
  }

  async getAssignmentProblem(apId: string): Promise<AssignmentProblem> {
    const ap = await this.assignmentProblems.findOne({
      where: { id: apId },
      relations: { problem: { tags: true }, languageTemplates: true },
    });
    if (!ap) throw new NotFoundException('Assignment problem not found');
    return ap;
  }

  /**
   * Everything the code-editor screen needs to bootstrap: statement, sample
   * testcases, per-language starter code (never driverCode — the judge harness is
   * never sent to the client) and, for a timed test, the clock (#145).
   *
   * The editor is a separate screen from the take page, so without the attempt
   * here the student spends the whole coding round with no countdown and
   * discovers the deadline as a 403 on the submit they were part-way through.
   * The permission check already loads the assignment; it is now returned rather
   * than discarded.
   *
   * The attempt is READ, never created. Opening a problem must not start
   * somebody's clock: the take page starts the attempt deliberately
   * (`startAttempt`), and `assertTestAttemptOpen` creates one lazily on the first
   * submit. A deep link straight here with no attempt yet simply reports `null`
   * and renders no countdown — the submit gate is server-side regardless, so
   * showing no clock is a display gap, whereas starting one would silently cost
   * the student time they never asked to spend.
   */
  async getEditorBootstrap(apId: string, actor: AuthenticatedUser): Promise<EditorBootstrapView> {
    const ap = await this.assignmentProblems.findOne({
      where: { id: apId },
      relations: { problem: { tags: true, testCases: true }, languageTemplates: true },
    });
    if (!ap) throw new NotFoundException('Assignment problem not found');
    const assignment = await this.findOne(ap.assignmentId, actor); // view permission + status visibility

    const attempt =
      assignment.kind === AssignmentKind.TEST
        ? await this.attempts.findOne({
            where: { assignmentId: assignment.id, userId: actor.id },
          })
        : null;

    return { ap, assignment, attempt: attempt ?? null };
  }

  async myActiveDeadlines(actor: AuthenticatedUser): Promise<Assignment[]> {
    const qb = this.assignments
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.targetBatches', 'tb')
      .where('a.status = :active', { active: AssignmentStatus.ACTIVE })
      .orderBy('a.end_date', 'ASC');
    if (!isSuperAdmin(actor) && actor.role !== Role.ADMIN) {
      // Site #2 of the three-site batch filter (§9.10). Creator/professor and
      // graders stay exempt; the batch predicate is applied only to plain
      // enrolled students.
      qb.andWhere(
        `EXISTS (SELECT 1 FROM classrooms c WHERE c.id = a.classroom_id AND (
           c.created_by_id = :uid OR c.professor_id = :uid
           OR EXISTS (SELECT 1 FROM classroom_graders cg WHERE cg.classroom_id = c.id AND cg.user_id = :uid)
           OR (
             EXISTS (SELECT 1 FROM classroom_students cs WHERE cs.classroom_id = c.id AND cs.user_id = :uid)
             AND (${AssignmentsService.BATCH_VISIBLE_SQL})
           )))`,
        { uid: actor.id },
      );
    }
    scopeToOrg(qb, 'a', actor);
    return qb.getMany();
  }

  // ---- helpers ----

  private async attachProblem(
    m: EntityManager,
    assignmentId: string,
    problemId: string,
    score: number,
    languages: Language[],
    isImported: boolean,
    templateSourceProblemId?: string,
  ): Promise<string> {
    const ap = m.getRepository(AssignmentProblem).create({
      assignmentId,
      problemId,
      score,
      isImported,
    });
    const savedAp = await m.getRepository(AssignmentProblem).save(ap);

    const sourceForTemplates = templateSourceProblemId ?? problemId;
    const libTemplates = await m.getRepository(LibraryProblemTemplate).find({
      where: { problemId: sourceForTemplates, language: In(languages) },
    });
    const byLang = new Map(libTemplates.map((t) => [t.language, t]));

    const templateRows = [...new Set(languages)].map((lang) => {
      const lib = byLang.get(lang);
      return m.getRepository(ProblemTemplate).create({
        assignmentProblemId: savedAp.id,
        language: lang,
        driverCode: lib?.driverCode ?? '',
        starterCode: lib?.starterCode ?? '',
      });
    });
    if (templateRows.length) await m.getRepository(ProblemTemplate).save(templateRows);
    return savedAp.id;
  }

  private async reconcileTemplates(ap: AssignmentProblem, languages: Language[]): Promise<void> {
    const desired = new Set(languages);
    const existing = await this.templates.find({ where: { assignmentProblemId: ap.id } });
    const existingLangs = new Set(existing.map((t) => t.language));

    const toRemove = existing.filter((t) => !desired.has(t.language));
    if (toRemove.length) await this.templates.remove(toRemove);

    const toAdd = [...desired].filter((l) => !existingLangs.has(l));
    if (toAdd.length) {
      const libTemplates = await this.libraryTemplates.find({
        where: { problemId: ap.problemId, language: In(toAdd) },
      });
      const byLang = new Map(libTemplates.map((t) => [t.language, t]));
      await this.templates.save(
        toAdd.map((lang) =>
          this.templates.create({
            assignmentProblemId: ap.id,
            language: lang,
            driverCode: byLang.get(lang)?.driverCode ?? '',
            starterCode: byLang.get(lang)?.starterCode ?? '',
          }),
        ),
      );
    }
  }

  /** Applies time-based transitions and persists any that changed. */
  private async refreshStatuses(assignments: Assignment[]): Promise<boolean> {
    const now = new Date();
    const changed = assignments.filter((a) => a.applyTimeTransition(now));
    if (changed.length) await this.assignments.save(changed);
    return changed.length > 0;
  }

  /**
   * Zero-traffic status sweep (#38, §5.2): flips every stale assignment's
   * time-based status independent of any user query. Reuses applyTimeTransition
   * (the single source of truth); the WHERE only pre-filters to bound the row
   * set. Driven by QUEUE_ASSIGNMENT_SWEEP every ~60s in the worker. Returns the
   * number of transitions persisted. Manual states are never touched.
   */
  async sweepStatuses(): Promise<number> {
    const now = new Date();
    const candidates = await this.assignments
      .createQueryBuilder('a')
      .where(
        '(a.status = :scheduled AND a.start_date <= :now) OR (a.status = :active AND a.end_date <= :now)',
        { scheduled: AssignmentStatus.SCHEDULED, active: AssignmentStatus.ACTIVE, now },
      )
      .getMany();
    if (!candidates.length) return 0;
    const changed = candidates.filter((a) => a.applyTimeTransition(now));
    if (changed.length) await this.assignments.save(changed);
    return changed.length;
  }

  /**
   * Server-authoritative per-attempt deadline gate for timed tests (#39, §9.9).
   * Plain assignments have no per-attempt clock (returns immediately). For a
   * test: lazily anchors the attempt on first submit (deadline capped at the
   * assignment's endDate), rejects a submitted/expired attempt, and auto-submits
   * on expiry. The client countdown is untrusted — this is the real gate.
   */
  async assertTestAttemptOpen(assignment: Assignment, userId: string): Promise<void> {
    if (assignment.kind !== AssignmentKind.TEST) return;

    let attempt = await this.attempts.findOne({
      where: { assignmentId: assignment.id, userId },
    });

    if (!attempt) {
      const now = new Date();
      const durationMs = (assignment.durationMinutes ?? 0) * 60_000;
      const cappedDeadline = Math.min(now.getTime() + durationMs, assignment.endDate.getTime());
      try {
        attempt = await this.attempts.save(
          this.attempts.create({
            assignmentId: assignment.id,
            userId,
            startedAt: now,
            deadlineAt: new Date(cappedDeadline),
            status: AttemptStatus.IN_PROGRESS,
          }),
        );
      } catch {
        // Unique (assignment_id, user_id) — a concurrent first-submit won the
        // race; re-select its row.
        attempt = await this.attempts.findOneOrFail({
          where: { assignmentId: assignment.id, userId },
        });
      }
    }

    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      throw new ForbiddenException('Your attempt has already been submitted');
    }
    if (new Date() > attempt.deadlineAt) {
      // Auto-submit, then reject this (late) submission.
      attempt.status = AttemptStatus.AUTO_SUBMITTED;
      attempt.submittedAt = new Date();
      await this.attempts.save(attempt);
      throw new ForbiddenException('Time is up for this test');
    }
  }

  /**
   * Zero-traffic auto-submit of expired attempts (#39), driven by the same
   * sweep tick as sweepStatuses. Idempotent: only touches in_progress rows.
   */
  async finalizeExpiredAttempts(): Promise<number> {
    const res = await this.attempts
      .createQueryBuilder()
      .update()
      .set({ status: AttemptStatus.AUTO_SUBMITTED, submittedAt: () => 'now()' })
      .where('status = :open AND deadline_at <= now()', { open: AttemptStatus.IN_PROGRESS })
      .execute();
    return res.affected ?? 0;
  }

  private assertCanManage(actor: AuthenticatedUser, classroom: Classroom): void {
    // Delegates to the shared staff/grader policy in ClassroomsService so
    // assignments/grading/submissions all enforce the identical rule.
    this.classroomsService.assertStaffOrGrader(actor, classroom);
  }

  private async assertCanManageAssignment(
    actor: AuthenticatedUser,
    assignment: Assignment,
  ): Promise<void> {
    const classroom = await this.classroomsService.getDetail(assignment.classroomId);
    this.assertCanManage(actor, classroom);
  }

  private async assertCanView(actor: AuthenticatedUser, assignment: Assignment): Promise<void> {
    if (isSuperAdmin(actor)) return;
    if (actor.role === Role.ADMIN) {
      assertSameOrg(actor, assignment.organizationId);
      return;
    }
    const classroom = await this.classroomsService.getDetail(assignment.classroomId);
    if (classroom.createdById === actor.id || classroom.professorId === actor.id) return;
    const isGrader = classroom.graders?.some((g) => g.id === actor.id);
    const isStudent = classroom.students?.some((s) => s.id === actor.id);
    if ((isGrader || isStudent) && VISIBLE_TO_STUDENTS.includes(assignment.status)) {
      // Site #3 of the three-site batch filter (§9.10). This is the submit
      // chokepoint (code-execution submit → findOne), so enforcing here also
      // blocks a non-batch student from submitting. Graders are exempt.
      if (isStudent && !isGrader && assignment.targetType === AssignmentTargetType.BATCH) {
        const inBatch = await this.dataSource.query(
          `SELECT 1 FROM assignment_target_batches atb
             JOIN batch_students bs ON bs.batch_id = atb.batch_id
             WHERE atb.assignment_id = $1 AND bs.user_id = $2 LIMIT 1`,
          [assignment.id, actor.id],
        );
        if (!inBatch.length) {
          throw new ForbiddenException('This assignment is targeted to specific batches');
        }
      }
      return;
    }
    if (isGrader && assignment.createdById === actor.id) return;
    throw new ForbiddenException('You do not have access to this assignment');
  }
}
