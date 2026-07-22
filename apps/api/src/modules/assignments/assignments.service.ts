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
import { ClassroomsService } from '../classrooms/classrooms.service';
import { Classroom } from '../classrooms/entities/classroom.entity';
import { LibraryProblemTemplate } from '../problems/entities/library-problem-template.entity';
import { Problem } from '../problems/entities/problem.entity';
import { TestCase } from '../problems/entities/test-case.entity';
import { ProblemSource, ProblemVisibility } from '../problems/enums/problem.enums';
import {
  CloneProblemDto,
  CreateAssignmentDto,
  EditAssignmentProblemDto,
  ImportProblemDto,
  QueryAssignmentsDto,
  UpdateAssignmentDto,
} from './dto/assignment.dto';
import { AssignmentProblem } from './entities/assignment-problem.entity';
import { Assignment } from './entities/assignment.entity';
import { ProblemTemplate } from './entities/problem-template.entity';
import { AssignmentStatus, VISIBLE_TO_STUDENTS } from './enums/assignment-status.enum';

@Injectable()
export class AssignmentsService {
  constructor(
    @InjectRepository(Assignment) private readonly assignments: Repository<Assignment>,
    @InjectRepository(AssignmentProblem)
    private readonly assignmentProblems: Repository<AssignmentProblem>,
    @InjectRepository(ProblemTemplate) private readonly templates: Repository<ProblemTemplate>,
    @InjectRepository(Problem) private readonly problems: Repository<Problem>,
    @InjectRepository(TestCase) private readonly testCases: Repository<TestCase>,
    @InjectRepository(LibraryProblemTemplate)
    private readonly libraryTemplates: Repository<LibraryProblemTemplate>,
    private readonly classroomsService: ClassroomsService,
    private readonly dataSource: DataSource,
    private readonly emitter: EventEmitter2,
  ) {}

  async create(dto: CreateAssignmentDto, actor: AuthenticatedUser): Promise<Assignment> {
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (start >= end) throw new BadRequestException('startDate must be before endDate');

    const classroom = await this.classroomsService.getDetail(dto.classroomId);
    this.assertCanManage(actor, classroom);

    const assignment = this.assignments.create({
      title: dto.title,
      description: dto.description ?? '',
      startDate: start,
      endDate: end,
      classroomId: dto.classroomId,
      createdById: actor.id,
      status: dto.asDraft ? AssignmentStatus.DRAFT : AssignmentStatus.SCHEDULED,
    });
    return this.assignments.save(assignment);
  }

  async findAll(
    query: QueryAssignmentsDto,
    actor: AuthenticatedUser,
  ): Promise<PaginatedResult<Assignment>> {
    const qb = this.assignments.createQueryBuilder('a').orderBy('a.createdAt', 'DESC');
    if (query.classroomId) qb.andWhere('a.classroom_id = :cid', { cid: query.classroomId });

    if (actor.role === Role.PROFESSOR) {
      qb.andWhere(
        `(a.created_by_id = :uid OR EXISTS (
            SELECT 1 FROM classrooms c WHERE c.id = a.classroom_id
            AND (c.created_by_id = :uid OR c.professor_id = :uid)))`,
        { uid: actor.id },
      );
    } else if (actor.role === Role.STUDENT) {
      qb.andWhere(
        `a.status IN (:...visible) AND EXISTS (
           SELECT 1 FROM classrooms c WHERE c.id = a.classroom_id AND (
             EXISTS (SELECT 1 FROM classroom_students cs WHERE cs.classroom_id = c.id AND cs.user_id = :uid)
             OR EXISTS (SELECT 1 FROM classroom_graders cg WHERE cg.classroom_id = c.id AND cg.user_id = :uid)))`,
        { uid: actor.id, visible: VISIBLE_TO_STUDENTS },
      );
    }

    const [rows, total] = await qb.skip(query.skip).take(query.limit).getManyAndCount();
    await this.refreshStatuses(rows);
    return PaginatedResult.of(rows, total, query);
  }

  async getById(id: string): Promise<Assignment> {
    const assignment = await this.assignments.findOne({ where: { id } });
    if (!assignment) throw new NotFoundException('Assignment not found');
    if (await this.refreshStatuses([assignment])) {
      // reload to reflect persisted status
      return this.assignments.findOneOrFail({ where: { id } });
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
    } satisfies AssignmentGradesPublishedEvent);
    return saved;
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

    const source = await this.problems.findOne({ where: { id: dto.sourceProblemId } });
    if (!source) throw new BadRequestException('Source problem not found');

    const dup = await this.assignmentProblems.findOne({
      where: { assignmentId, problemId: source.id },
    });
    if (dup) throw new BadRequestException('Problem already attached to this assignment');

    const apId = await this.dataSource.transaction((m) =>
      this.attachProblem(m, assignment.id, source.id, dto.score, dto.languages, true),
    );
    const ap = await this.getAssignmentProblem(apId);
    this.notifyProblemAdded(assignment, ap, actor.id);
    return ap;
  }

  async cloneProblem(
    assignmentId: string,
    dto: CloneProblemDto,
    actor: AuthenticatedUser,
  ): Promise<AssignmentProblem> {
    const assignment = await this.getById(assignmentId);
    await this.assertCanManageAssignment(actor, assignment);

    const source = await this.problems.findOne({
      where: { id: dto.sourceProblemId },
      relations: { tags: true },
    });
    if (!source) throw new BadRequestException('Source problem not found');
    const activeCases = await this.testCases.find({
      where: { problemId: source.id, isActive: true },
    });

    const apId = await this.dataSource.transaction(async (m) => {
      const cloned = m.getRepository(Problem).create({
        title: dto.problem.title,
        body: dto.problem.body,
        difficulty: dto.problem.difficulty ?? source.difficulty,
        visibility: ProblemVisibility.PRIVATE,
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
    this.notifyProblemAdded(assignment, ap, actor.id);
    return ap;
  }

  /**
   * Notify enrolled students/graders when a problem is added to an assignment
   * they can already see. DRAFT/SCHEDULED attachments notify no one (the
   * assignment isn't visible yet — the publish event covers that later).
   */
  private notifyProblemAdded(
    assignment: Assignment,
    ap: AssignmentProblem,
    actorId: string,
  ): void {
    if (!VISIBLE_TO_STUDENTS.includes(assignment.status)) return;
    this.emitter.emit(ASSIGNMENT_PROBLEM_ADDED, {
      assignmentId: assignment.id,
      assignmentProblemId: ap.id,
      classroomId: assignment.classroomId,
      assignmentTitle: assignment.title,
      problemTitle: ap.problem?.title ?? 'A new problem',
      actorId,
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

    if (dto.score !== undefined) ap.score = dto.score;
    await this.assignmentProblems.save(ap);

    if (dto.languages) {
      await this.reconcileTemplates(ap, dto.languages);
    }
    return this.getAssignmentProblem(apId);
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

  /** Everything the code-editor screen needs to bootstrap: statement, sample
   * testcases, and per-language starter code (never driverCode — the judge
   * harness is never sent to the client). */
  async getEditorBootstrap(apId: string, actor: AuthenticatedUser): Promise<AssignmentProblem> {
    const ap = await this.assignmentProblems.findOne({
      where: { id: apId },
      relations: { problem: { tags: true, testCases: true }, languageTemplates: true },
    });
    if (!ap) throw new NotFoundException('Assignment problem not found');
    await this.findOne(ap.assignmentId, actor); // view permission + status visibility
    return ap;
  }

  async myActiveDeadlines(actor: AuthenticatedUser): Promise<Assignment[]> {
    const qb = this.assignments
      .createQueryBuilder('a')
      .where('a.status = :active', { active: AssignmentStatus.ACTIVE })
      .orderBy('a.end_date', 'ASC');
    if (actor.role !== Role.ADMIN) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM classrooms c WHERE c.id = a.classroom_id AND (
           c.created_by_id = :uid OR c.professor_id = :uid
           OR EXISTS (SELECT 1 FROM classroom_students cs WHERE cs.classroom_id = c.id AND cs.user_id = :uid)
           OR EXISTS (SELECT 1 FROM classroom_graders cg WHERE cg.classroom_id = c.id AND cg.user_id = :uid)))`,
        { uid: actor.id },
      );
    }
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
    if (actor.role === Role.ADMIN) return;
    const classroom = await this.classroomsService.getDetail(assignment.classroomId);
    if (classroom.createdById === actor.id || classroom.professorId === actor.id) return;
    const isGrader = classroom.graders?.some((g) => g.id === actor.id);
    const isStudent = classroom.students?.some((s) => s.id === actor.id);
    if ((isGrader || isStudent) && VISIBLE_TO_STUDENTS.includes(assignment.status)) return;
    if (isGrader && assignment.createdById === actor.id) return;
    throw new ForbiddenException('You do not have access to this assignment');
  }
}
