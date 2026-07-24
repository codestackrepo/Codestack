import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  SUBMISSION_FINALIZED,
  SubmissionFinalizedEvent,
} from '../../common/events/submission-events';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AssignmentItem } from '../assignments/entities/assignment-item.entity';
import { AssignmentProblem } from '../assignments/entities/assignment-problem.entity';
import { Assignment } from '../assignments/entities/assignment.entity';
import { McqResponse } from '../assignments/entities/mcq-response.entity';
import { QuizResponse } from '../assignments/entities/quiz-response.entity';
import { AssignmentItemKind } from '../assignments/enums/assignment-item-kind.enum';
import { AssignmentStatus } from '../assignments/enums/assignment-status.enum';
import { ClassroomsService } from '../classrooms/classrooms.service';
import { Classroom } from '../classrooms/entities/classroom.entity';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { Submission } from '../submissions/entities/submission.entity';
import { SubmissionContext } from '../submissions/enums/submission-context.enum';
import { SubmissionStatus } from '../submissions/enums/submission-status.enum';
import { AssignmentScore } from './entities/assignment-score.entity';
import { ProblemScore } from './entities/problem-score.entity';
import { GradingStatus } from './enums/grading-status.enum';
import { UpdateScoreDto } from './dto/grading.dto';

/**
 * A single item's score line as seen in a gradebook / student score view.
 * `score`/`feedback` are null/'' for a student until the assignment is
 * GRADE_PUBLISHED (reveal gating, §9.2); staff always see the true values.
 * Issue #24 (frontend gradebook + student card) mirrors this shape exactly.
 */
export interface ItemScoreView {
  itemId: string;
  kind: AssignmentItemKind;
  assignmentProblemId: string | null;
  title: string;
  maxScore: number;
  score: number | null;
  gradingStatus: GradingStatus;
  feedback: string;
  solved?: boolean | null;
}

/** Assignment-level rollup. `finalScore` is null for a student pre-publish. */
export interface AssignmentScoreRollup {
  finalScore: number | null;
  maxScore: number;
  feedback: string;
}

export interface StudentScoreView {
  userId: string;
  assignmentScore: AssignmentScoreRollup;
  items: ItemScoreView[];
}

@Injectable()
export class GradingService {
  private readonly logger = new Logger(GradingService.name);

  constructor(
    @InjectRepository(ProblemScore) private readonly problemScores: Repository<ProblemScore>,
    @InjectRepository(AssignmentScore)
    private readonly assignmentScores: Repository<AssignmentScore>,
    @InjectRepository(Submission) private readonly submissions: Repository<Submission>,
    @InjectRepository(AssignmentProblem)
    private readonly assignmentProblems: Repository<AssignmentProblem>,
    @InjectRepository(Assignment) private readonly assignments: Repository<Assignment>,
    @InjectRepository(AssignmentItem) private readonly items: Repository<AssignmentItem>,
    @InjectRepository(McqResponse) private readonly mcqResponses: Repository<McqResponse>,
    @InjectRepository(QuizResponse) private readonly quizResponses: Repository<QuizResponse>,
    private readonly classrooms: ClassroomsService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * On finalize, track the attempt and mark the coding item as awaiting manual
   * review. Scoring is professor-driven now — award-on-accept was removed (§5.3,
   * decision #3): the student's points stay 0 until a professor grades. Practice
   * submissions never touch assignment scores (explicit context guard, §5.5).
   */
  @OnEvent(SUBMISSION_FINALIZED)
  async onSubmissionFinalized(event: SubmissionFinalizedEvent): Promise<void> {
    try {
      const submission = await this.submissions.findOne({ where: { id: event.submissionId } });
      if (!submission) return;
      // Practice never touches assignment scoring — guard explicitly rather than
      // relying on the null assignmentProblemId AP lookup returning null.
      if (submission.context === SubmissionContext.PRACTICE) return;
      const ap = await this.assignmentProblems.findOne({
        where: { id: submission.assignmentProblemId },
        relations: { assignment: true, problem: true },
      });
      if (!ap) return;

      const classroom = await this.classrooms.getDetail(ap.assignment.classroomId);
      // Professor test-submissions never affect scores.
      if (classroom.professorId === submission.userId) return;

      const ps = await this.getOrCreateProblemScore(ap.id, submission.userId);
      ps.submissionCount += 1;
      const isFirstSubmission = ps.submissionCount === 1;

      // Attempt tracking only — NO auto-award. Pin the representative submission
      // (prefer an accepted one; don't overwrite an accepted with a later WA).
      const accepted = submission.status === SubmissionStatus.ACCEPTED;
      const alreadyAccepted = ps.submission?.status === SubmissionStatus.ACCEPTED;
      if (accepted || !alreadyAccepted) {
        ps.submission = submission;
        ps.submissionId = submission.id;
      }
      // Coding item now awaits manual review — but never revert a graded item.
      if (ps.gradingStatus !== GradingStatus.GRADED) {
        ps.gradingStatus = GradingStatus.SUBMITTED;
      }
      await this.problemScores.save(ps);
      await this.recomputeAssignmentScore(ap.assignmentId, submission.userId);

      // Notify staff/graders the first time a student submits a given problem
      // (idempotent on the problem-score id, so resubmissions never re-notify).
      if (isFirstSubmission) {
        await this.notifyStaffOfSubmission(classroom, submission.userId, ap, ps.id);
      }
    } catch (err) {
      this.logger.error(`Scoring failed for submission ${event.submissionId}: ${String(err)}`);
    }
  }

  private async notifyStaffOfSubmission(
    classroom: Classroom,
    studentId: string,
    ap: AssignmentProblem,
    problemScoreId: string,
  ): Promise<void> {
    const recipientIds: string[] = [];
    if (classroom.professorId) recipientIds.push(classroom.professorId);
    recipientIds.push(...(classroom.graders ?? []).map((g) => g.id));
    if (!recipientIds.length) return;

    const submitter = [...(classroom.students ?? []), ...(classroom.graders ?? [])].find(
      (u) => u.id === studentId,
    );
    const studentName = submitter ? `${submitter.firstName} ${submitter.lastName}` : 'A student';
    const problemTitle = ap.problem?.title ?? 'a problem';

    await this.notifications.createForRecipients({
      recipientIds,
      actorId: studentId, // don't notify a grader about their own submission
      type: NotificationType.SUBMISSION_RECEIVED,
      title: `New submission: ${problemTitle}`,
      message: `${studentName} submitted a solution to "${problemTitle}".`,
      entityType: 'problem_score',
      entityId: problemScoreId,
      link: '/home/grading',
    });
  }

  async getStudentScore(assignmentId: string, actor: AuthenticatedUser): Promise<StudentScoreView> {
    // Self-service read of one's own score. Item scores + finalScore are hidden
    // until GRADE_PUBLISHED (§9.2); the assignment must exist so a bogus id 404s
    // instead of returning silent zeros.
    await this.assertAssignmentExists(assignmentId);
    return this.buildStudentScore(assignmentId, actor.id);
  }

  /**
   * Professor gradebook. Never reveal-gated — staff always see full scores +
   * gradingStatus for every item. Batches all students' data into a handful of
   * queries (per-kind bulk fetch) rather than ~queries-per-student.
   */
  async getStudentsScore(
    assignmentId: string,
    actor: AuthenticatedUser,
  ): Promise<StudentScoreView[]> {
    const classroom = await this.classroomForAssignment(assignmentId);
    this.assertStaffOrGrader(actor, classroom);
    const students = classroom.students ?? [];
    if (!students.length) return [];

    const items = await this.loadItems(assignmentId);
    const studentIds = students.map((s) => s.id);
    const codingApIds = items
      .filter((i) => i.kind === AssignmentItemKind.CODING && i.assignmentProblemId)
      .map((i) => i.assignmentProblemId as string);
    const mcqItemIds = items.filter((i) => i.kind === AssignmentItemKind.MCQ).map((i) => i.id);
    const quizItemIds = items.filter((i) => i.kind === AssignmentItemKind.QUIZ).map((i) => i.id);

    const [allProblemScores, allMcq, allQuiz, allAssignmentScores] = await Promise.all([
      codingApIds.length
        ? this.problemScores.find({
            where: { assignmentProblemId: In(codingApIds), userId: In(studentIds) },
          })
        : Promise.resolve([]),
      mcqItemIds.length
        ? this.mcqResponses.find({ where: { itemId: In(mcqItemIds), userId: In(studentIds) } })
        : Promise.resolve([]),
      quizItemIds.length
        ? this.quizResponses.find({ where: { itemId: In(quizItemIds), userId: In(studentIds) } })
        : Promise.resolve([]),
      this.assignmentScores.find({ where: { assignmentId, userId: In(studentIds) } }),
    ]);

    const psByUserAp = this.nest(
      allProblemScores,
      (r) => r.userId,
      (r) => r.assignmentProblemId,
    );
    const mcqByUserItem = this.nest(
      allMcq,
      (r) => r.userId,
      (r) => r.itemId,
    );
    const quizByUserItem = this.nest(
      allQuiz,
      (r) => r.userId,
      (r) => r.itemId,
    );
    const assignmentScoreByUser = new Map(allAssignmentScores.map((a) => [a.userId, a]));
    const maxScore = items.reduce((sum, i) => sum + i.maxPoints, 0);

    return students.map((student) => {
      const itemViews = items.map((item) =>
        this.itemView(
          item,
          {
            ps: psByUserAp.get(student.id)?.get(item.assignmentProblemId ?? ''),
            mcq: mcqByUserItem.get(student.id)?.get(item.id),
            quiz: quizByUserItem.get(student.id)?.get(item.id),
          },
          true, // staff: never reveal-gated
        ),
      );
      const stored = assignmentScoreByUser.get(student.id);
      return {
        userId: student.id,
        assignmentScore: {
          finalScore: stored?.finalScore ?? 0,
          maxScore,
          feedback: stored?.feedback ?? '',
        },
        items: itemViews,
      };
    });
  }

  /**
   * Legacy coding-only manual grade (kept working for existing callers). Prefer
   * the item-keyed `gradeItem` for new code.
   */
  async updateScore(
    apId: string,
    studentId: string,
    dto: UpdateScoreDto,
    actor: AuthenticatedUser,
  ): Promise<ProblemScore> {
    const ap = await this.assignmentProblems.findOne({
      where: { id: apId },
      relations: { assignment: true, problem: true },
    });
    if (!ap) throw new NotFoundException('Assignment problem not found');
    const classroom = await this.classrooms.getById(ap.assignment.classroomId);
    this.assertStaffOrGrader(actor, classroom);
    if (dto.score > ap.score) {
      throw new BadRequestException(`Score cannot exceed the problem's max points (${ap.score})`);
    }

    const ps = await this.getOrCreateProblemScore(apId, studentId);
    ps.score = dto.score;
    if (dto.feedback !== undefined) ps.feedback = dto.feedback;
    ps.createdById = actor.id;
    ps.gradingStatus = GradingStatus.GRADED; // a professor applied a score
    await this.problemScores.save(ps);
    await this.recomputeAssignmentScore(ap.assignmentId, studentId);
    await this.notifyStudentOfReview(studentId, actor.id, ap.problem?.title ?? 'a problem', ps.id);
    return ps;
  }

  /**
   * Item-keyed manual grade (§5.3). Dispatches by item kind: coding writes the
   * ProblemScore, quiz writes the QuizResponse, mcq allows a staff override of
   * the auto-award. Clamps to the item's maxPoints, recomputes the rollup, and
   * notifies the student. Returns the item's post-grade view.
   */
  async gradeItem(
    itemId: string,
    studentId: string,
    dto: UpdateScoreDto,
    actor: AuthenticatedUser,
  ): Promise<ItemScoreView> {
    const item = await this.items.findOne({
      where: { id: itemId },
      relations: { assignment: true, assignmentProblem: { problem: true } },
    });
    if (!item) throw new NotFoundException('Assignment item not found');
    const classroom = await this.classrooms.getById(item.assignment.classroomId);
    this.assertStaffOrGrader(actor, classroom);
    if (dto.score > item.maxPoints) {
      throw new BadRequestException(
        `Score cannot exceed the item's max points (${item.maxPoints})`,
      );
    }

    let ps: ProblemScore | undefined;
    let mcq: McqResponse | undefined;
    let quiz: QuizResponse | undefined;

    switch (item.kind) {
      case AssignmentItemKind.CODING: {
        if (!item.assignmentProblemId) {
          throw new BadRequestException('Coding item has no linked problem');
        }
        ps = await this.getOrCreateProblemScore(item.assignmentProblemId, studentId);
        ps.score = dto.score;
        if (dto.feedback !== undefined) ps.feedback = dto.feedback;
        ps.createdById = actor.id;
        ps.gradingStatus = GradingStatus.GRADED;
        await this.problemScores.save(ps);
        break;
      }
      case AssignmentItemKind.QUIZ: {
        quiz =
          (await this.quizResponses.findOne({ where: { itemId, userId: studentId } })) ??
          this.quizResponses.create({ itemId, userId: studentId, answerText: '' });
        quiz.awardedPoints = dto.score;
        if (dto.feedback !== undefined) quiz.feedback = dto.feedback;
        quiz.gradedById = actor.id;
        quiz = await this.quizResponses.save(quiz);
        break;
      }
      case AssignmentItemKind.MCQ: {
        // MCQ is auto-scored on submit; a manual grade here is a staff override
        // for edge cases only — there must already be a response to override.
        mcq = (await this.mcqResponses.findOne({ where: { itemId, userId: studentId } })) as
          McqResponse | undefined;
        if (!mcq) {
          throw new BadRequestException(
            'MCQ items are auto-scored; there is no response to override',
          );
        }
        mcq.awardedPoints = dto.score;
        mcq = await this.mcqResponses.save(mcq);
        break;
      }
    }

    await this.recomputeAssignmentScore(item.assignmentId, studentId);
    const entityId = ps?.id ?? quiz?.id ?? mcq?.id ?? item.id;
    await this.notifyStudentOfReview(studentId, actor.id, this.itemTitle(item), entityId);
    return this.itemView(item, { ps, mcq, quiz }, true);
  }

  /**
   * Staff item-review detail for the grading drawer (issue #24). Returns per-kind
   * detail: coding → the student's pinned/latest submission + score; mcq →
   * selection vs. the correct options (staff-only `isCorrect`); quiz → the text
   * answer + award. Staff/grader only — never call this on a student path.
   */
  async getItemReview(itemId: string, studentId: string, actor: AuthenticatedUser) {
    const item = await this.items.findOne({
      where: { id: itemId },
      relations: { assignment: true, assignmentProblem: { problem: true }, options: true },
    });
    if (!item) throw new NotFoundException('Assignment item not found');
    const classroom = await this.classrooms.getById(item.assignment.classroomId);
    this.assertStaffOrGrader(actor, classroom);

    const base = { itemId: item.id, kind: item.kind, maxPoints: item.maxPoints };

    if (item.kind === AssignmentItemKind.CODING) {
      const ps = await this.problemScores.findOne({
        where: { assignmentProblemId: item.assignmentProblemId ?? '', userId: studentId },
        relations: { submission: true },
      });
      const submission =
        ps?.submission ??
        (item.assignmentProblemId
          ? await this.submissions.findOne({
              where: { assignmentProblemId: item.assignmentProblemId, userId: studentId },
              order: { createdAt: 'DESC' },
            })
          : null);
      return {
        ...base,
        title: this.itemTitle(item),
        submission: submission
          ? {
              id: submission.id,
              userCode: submission.userCode,
              language: submission.language,
              status: submission.status,
              passedTestcaseCount: submission.passedTestcaseCount,
              totalTestcaseCount: submission.totalTestcaseCount,
              failedTestcaseDetail: submission.failedTestcaseDetail,
            }
          : null,
        score: ps?.score ?? 0,
        feedback: ps?.feedback ?? '',
        gradingStatus: ps?.gradingStatus ?? GradingStatus.NOT_STARTED,
      };
    }

    if (item.kind === AssignmentItemKind.MCQ) {
      const mcq = await this.mcqResponses.findOne({ where: { itemId, userId: studentId } });
      return {
        ...base,
        prompt: item.prompt,
        options: (item.options ?? [])
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((o) => ({
            id: o.id,
            text: o.text,
            isCorrect: o.isCorrect,
            orderIndex: o.orderIndex,
          })),
        selectedOptionIds: mcq?.selectedOptionIds ?? [],
        awardedPoints: mcq?.awardedPoints ?? 0,
      };
    }

    // quiz
    const quiz = await this.quizResponses.findOne({ where: { itemId, userId: studentId } });
    return {
      ...base,
      prompt: item.prompt,
      answerText: quiz?.answerText ?? '',
      awardedPoints: quiz?.awardedPoints ?? null,
      feedback: quiz?.feedback ?? '',
      gradedById: quiz?.gradedById ?? null,
    };
  }

  private async notifyStudentOfReview(
    studentId: string,
    actorId: string,
    itemTitle: string,
    entityId: string,
  ): Promise<void> {
    try {
      await this.notifications.createForRecipients({
        recipientIds: [studentId],
        actorId,
        type: NotificationType.FEEDBACK_RECEIVED,
        title: 'Your work was reviewed',
        message: `You received a grade and feedback on "${itemTitle}".`,
        entityType: 'problem_score',
        entityId,
        link: '/home/assignments',
      });
    } catch (err) {
      this.logger.warn(`Failed to notify student ${studentId} of review: ${String(err)}`);
    }
  }

  async getAssignmentScore(assignmentId: string, actor: AuthenticatedUser) {
    const assignment = await this.assignments.findOne({ where: { id: assignmentId } });
    if (!assignment) throw new NotFoundException('Assignment not found');
    const stored = await this.readAssignmentScore(assignmentId, actor.id);
    // Self-read: honor the reveal gate so finalScore never leaks pre-publish.
    const reveal = assignment.status === AssignmentStatus.GRADE_PUBLISHED;
    return {
      finalScore: reveal ? stored.finalScore : null,
      feedback: reveal ? stored.feedback : '',
    };
  }

  // ---- helpers ----

  /** Assignment items ordered for display, with coding problems joined for titles. */
  private loadItems(assignmentId: string): Promise<AssignmentItem[]> {
    return this.items.find({
      where: { assignmentId },
      relations: { assignmentProblem: { problem: true } },
      order: { orderIndex: 'ASC' },
    });
  }

  private itemTitle(item: AssignmentItem): string {
    if (item.kind === AssignmentItemKind.CODING) {
      return item.assignmentProblem?.problem?.title ?? 'a problem';
    }
    return item.prompt || 'an item';
  }

  /**
   * Build one item's score line. When `reveal` is false (a student before
   * GRADE_PUBLISHED), score + feedback are withheld (score: null) but the
   * gradingStatus is still surfaced so the UI can show "awaiting review".
   */
  private itemView(
    item: AssignmentItem,
    data: { ps?: ProblemScore; mcq?: McqResponse; quiz?: QuizResponse },
    reveal: boolean,
  ): ItemScoreView {
    const isCoding = item.kind === AssignmentItemKind.CODING;
    let score = 0;
    let gradingStatus = GradingStatus.NOT_STARTED;
    let feedback = '';
    let solved: boolean | null = null;

    switch (item.kind) {
      case AssignmentItemKind.CODING:
        score = data.ps?.score ?? 0;
        gradingStatus = data.ps?.gradingStatus ?? GradingStatus.NOT_STARTED;
        feedback = data.ps?.feedback ?? '';
        solved = (data.ps?.submissionId ?? null) !== null && (data.ps?.score ?? 0) > 0;
        break;
      case AssignmentItemKind.MCQ:
        score = data.mcq?.awardedPoints ?? 0;
        gradingStatus = data.mcq ? GradingStatus.GRADED : GradingStatus.NOT_STARTED;
        break;
      case AssignmentItemKind.QUIZ:
        score = data.quiz?.awardedPoints ?? 0;
        gradingStatus = data.quiz
          ? data.quiz.awardedPoints != null
            ? GradingStatus.GRADED
            : GradingStatus.SUBMITTED
          : GradingStatus.NOT_STARTED;
        feedback = data.quiz?.feedback ?? '';
        break;
    }

    // Pre-publish, represent state as submitted/not_started only (§9.2): a
    // 'graded' status would tell the student grading is done before the reveal,
    // so it's clamped to 'submitted' until GRADE_PUBLISHED.
    const displayStatus =
      reveal || gradingStatus !== GradingStatus.GRADED ? gradingStatus : GradingStatus.SUBMITTED;

    const view: ItemScoreView = {
      itemId: item.id,
      kind: item.kind,
      assignmentProblemId: item.assignmentProblemId,
      title: this.itemTitle(item),
      maxScore: item.maxPoints,
      score: reveal ? score : null,
      gradingStatus: displayStatus,
      feedback: reveal ? feedback : '',
    };
    if (isCoding) view.solved = reveal ? solved : null;
    return view;
  }

  /** Group rows into a two-level map keyed by (outer, inner). */
  private nest<T>(
    rows: T[],
    outer: (r: T) => string,
    inner: (r: T) => string,
  ): Map<string, Map<string, T>> {
    const map = new Map<string, Map<string, T>>();
    for (const r of rows) {
      const o = outer(r);
      if (!map.has(o)) map.set(o, new Map());
      map.get(o)!.set(inner(r), r);
    }
    return map;
  }

  private async buildStudentScore(assignmentId: string, userId: string): Promise<StudentScoreView> {
    const assignment = await this.assignments.findOne({ where: { id: assignmentId } });
    const reveal = assignment?.status === AssignmentStatus.GRADE_PUBLISHED;

    const items = await this.loadItems(assignmentId);
    const codingApIds = items
      .filter((i) => i.kind === AssignmentItemKind.CODING && i.assignmentProblemId)
      .map((i) => i.assignmentProblemId as string);
    const mcqItemIds = items.filter((i) => i.kind === AssignmentItemKind.MCQ).map((i) => i.id);
    const quizItemIds = items.filter((i) => i.kind === AssignmentItemKind.QUIZ).map((i) => i.id);

    const [problemScores, mcqRows, quizRows] = await Promise.all([
      codingApIds.length
        ? this.problemScores.find({ where: { assignmentProblemId: In(codingApIds), userId } })
        : Promise.resolve([]),
      mcqItemIds.length
        ? this.mcqResponses.find({ where: { itemId: In(mcqItemIds), userId } })
        : Promise.resolve([]),
      quizItemIds.length
        ? this.quizResponses.find({ where: { itemId: In(quizItemIds), userId } })
        : Promise.resolve([]),
    ]);

    const psByAp = new Map(problemScores.map((p) => [p.assignmentProblemId, p]));
    const mcqByItem = new Map(mcqRows.map((m) => [m.itemId, m]));
    const quizByItem = new Map(quizRows.map((q) => [q.itemId, q]));

    const itemViews = items.map((item) =>
      this.itemView(
        item,
        {
          ps: item.assignmentProblemId ? psByAp.get(item.assignmentProblemId) : undefined,
          mcq: mcqByItem.get(item.id),
          quiz: quizByItem.get(item.id),
        },
        reveal,
      ),
    );

    const maxScore = items.reduce((sum, i) => sum + i.maxPoints, 0);
    const stored = await this.readAssignmentScore(assignmentId, userId);
    return {
      userId,
      assignmentScore: {
        finalScore: reveal ? stored.finalScore : null,
        maxScore,
        feedback: reveal ? stored.feedback : '',
      },
      items: itemViews,
    };
  }

  private async getOrCreateProblemScore(apId: string, userId: string): Promise<ProblemScore> {
    let ps = await this.problemScores.findOne({
      where: { assignmentProblemId: apId, userId },
      relations: { submission: true },
    });
    if (!ps) {
      ps = this.problemScores.create({
        assignmentProblemId: apId,
        userId,
        score: 0,
        submissionCount: 0,
      });
      ps = await this.problemScores.save(ps);
    }
    return ps;
  }

  private async getOrCreateAssignmentScore(
    assignmentId: string,
    userId: string,
  ): Promise<AssignmentScore> {
    let as = await this.assignmentScores.findOne({ where: { assignmentId, userId } });
    if (!as) {
      as = this.assignmentScores.create({ assignmentId, userId, finalScore: 0 });
      as = await this.assignmentScores.save(as);
    }
    return as;
  }

  /**
   * Non-mutating counterpart to getOrCreateAssignmentScore for pure reads —
   * a GET must never insert a row as a side effect. Returns a transient zero
   * score when none exists yet (e.g. before the student's first submission).
   */
  private async readAssignmentScore(
    assignmentId: string,
    userId: string,
  ): Promise<Pick<AssignmentScore, 'finalScore' | 'feedback'>> {
    const existing = await this.assignmentScores.findOne({ where: { assignmentId, userId } });
    return existing ?? { finalScore: 0, feedback: '' };
  }

  private async assertAssignmentExists(assignmentId: string): Promise<void> {
    const exists = await this.assignments.exist({ where: { id: assignmentId } });
    if (!exists) throw new NotFoundException('Assignment not found');
  }

  /**
   * Recompute the stored assignment total across ALL item kinds for one user:
   * coding (ProblemScore.score) + mcq (auto awarded) + quiz (manual awarded).
   * The stored finalScore is the TRUE total — the reveal gate applies only to
   * the student-facing DTO, never to what's persisted.
   */
  private async recomputeAssignmentScore(assignmentId: string, userId: string): Promise<void> {
    const [codingRow, mcqRow, quizRow] = await Promise.all([
      this.problemScores
        .createQueryBuilder('ps')
        .innerJoin(AssignmentProblem, 'ap', 'ap.id = ps.assignment_problem_id')
        .where('ap.assignment_id = :assignmentId', { assignmentId })
        .andWhere('ps.user_id = :userId', { userId })
        .select('COALESCE(SUM(ps.score), 0)', 'total')
        .getRawOne<{ total: string }>(),
      this.mcqResponses
        .createQueryBuilder('mr')
        .innerJoin(AssignmentItem, 'ai', 'ai.id = mr.item_id')
        .where('ai.assignment_id = :assignmentId', { assignmentId })
        .andWhere('ai.kind = :kind', { kind: AssignmentItemKind.MCQ })
        .andWhere('mr.user_id = :userId', { userId })
        .select('COALESCE(SUM(mr.awarded_points), 0)', 'total')
        .getRawOne<{ total: string }>(),
      this.quizResponses
        .createQueryBuilder('qr')
        .innerJoin(AssignmentItem, 'ai', 'ai.id = qr.item_id')
        .where('ai.assignment_id = :assignmentId', { assignmentId })
        .andWhere('ai.kind = :kind', { kind: AssignmentItemKind.QUIZ })
        .andWhere('qr.user_id = :userId', { userId })
        .select('COALESCE(SUM(qr.awarded_points), 0)', 'total')
        .getRawOne<{ total: string }>(),
    ]);

    const total =
      Number(codingRow?.total ?? 0) + Number(mcqRow?.total ?? 0) + Number(quizRow?.total ?? 0);
    const as = await this.getOrCreateAssignmentScore(assignmentId, userId);
    as.finalScore = total;
    await this.assignmentScores.save(as);
  }

  private async classroomForAssignment(assignmentId: string): Promise<Classroom> {
    const assignment = await this.assignments.findOne({ where: { id: assignmentId } });
    if (!assignment) throw new NotFoundException('Assignment not found');
    return this.classrooms.getDetail(assignment.classroomId);
  }

  private assertStaffOrGrader(actor: AuthenticatedUser, classroom: Classroom): void {
    // Delegates to the shared staff/grader policy in ClassroomsService so
    // assignments/grading/submissions all enforce the identical rule.
    this.classrooms.assertStaffOrGrader(actor, classroom);
  }
}
