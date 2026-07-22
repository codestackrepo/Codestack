import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  SUBMISSION_FINALIZED,
  SubmissionFinalizedEvent,
} from '../../common/events/submission-events';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AssignmentProblem } from '../assignments/entities/assignment-problem.entity';
import { Assignment } from '../assignments/entities/assignment.entity';
import { ClassroomsService } from '../classrooms/classrooms.service';
import { Classroom } from '../classrooms/entities/classroom.entity';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { Submission } from '../submissions/entities/submission.entity';
import { SubmissionStatus } from '../submissions/enums/submission-status.enum';
import { AssignmentScore } from './entities/assignment-score.entity';
import { ProblemScore } from './entities/problem-score.entity';
import { UpdateScoreDto } from './dto/grading.dto';

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
    private readonly classrooms: ClassroomsService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Award-on-accept: when a submission finalizes, update the student's problem
   * score (full points on first Accept) and roll up the assignment total.
   */
  @OnEvent(SUBMISSION_FINALIZED)
  async onSubmissionFinalized(event: SubmissionFinalizedEvent): Promise<void> {
    try {
      const submission = await this.submissions.findOne({ where: { id: event.submissionId } });
      if (!submission) return;
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

      const accepted = submission.status === SubmissionStatus.ACCEPTED;
      const alreadyAccepted = ps.submission?.status === SubmissionStatus.ACCEPTED;
      if (accepted) {
        ps.submission = submission;
        ps.submissionId = submission.id;
        ps.score = ap.score; // award full points
      } else if (!alreadyAccepted) {
        ps.submission = submission;
        ps.submissionId = submission.id;
        // score unchanged (stays 0 until an accepted submission arrives)
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
    const studentName = submitter
      ? `${submitter.firstName} ${submitter.lastName}`
      : 'A student';
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

  async getStudentScore(assignmentId: string, actor: AuthenticatedUser) {
    // Self-service read of one's own score. Grades/feedback are visible as soon
    // as they exist (award-on-accept points + professor reviews); the assignment
    // must exist so a bogus id 404s instead of returning silent zeros.
    await this.assertAssignmentExists(assignmentId);
    return this.buildStudentScore(assignmentId, actor.id);
  }

  /**
   * Professor gradebook. Batches all students' scores into two queries
   * total (instead of ~3 queries per student) — the assignment-problem list
   * and any per-student read are identical across students, so N students
   * previously issued ~3N round-trips.
   */
  async getStudentsScore(assignmentId: string, actor: AuthenticatedUser) {
    const classroom = await this.classroomForAssignment(assignmentId);
    this.assertStaffOrGrader(actor, classroom);
    const students = classroom.students ?? [];
    if (!students.length) return [];

    const aps = await this.assignmentProblems.find({
      where: { assignmentId },
      relations: { problem: true },
    });
    const studentIds = students.map((s) => s.id);
    const apIds = aps.map((ap) => ap.id);

    const [allScores, allAssignmentScores] = await Promise.all([
      apIds.length
        ? this.problemScores.find({
            where: { assignmentProblemId: In(apIds), userId: In(studentIds) },
          })
        : Promise.resolve([]),
      this.assignmentScores.find({ where: { assignmentId, userId: In(studentIds) } }),
    ]);

    const scoresByUser = new Map<string, Map<string, ProblemScore>>();
    for (const s of allScores) {
      if (!scoresByUser.has(s.userId)) scoresByUser.set(s.userId, new Map());
      scoresByUser.get(s.userId)!.set(s.assignmentProblemId, s);
    }
    const assignmentScoreByUser = new Map(allAssignmentScores.map((a) => [a.userId, a]));
    const maxScore = aps.reduce((sum, ap) => sum + ap.score, 0);

    return students.map((student) => {
      const byAp = scoresByUser.get(student.id) ?? new Map<string, ProblemScore>();
      const problems = aps.map((ap) => {
        const s = byAp.get(ap.id);
        return {
          assignmentProblemId: ap.id,
          problemId: ap.problemId,
          title: ap.problem?.title ?? '',
          maxScore: ap.score,
          score: s?.score ?? 0,
          submissionCount: s?.submissionCount ?? 0,
          solved: (s?.submissionId ?? null) !== null && (s?.score ?? 0) > 0,
          feedback: s?.feedback ?? '',
        };
      });
      const assignmentScore = assignmentScoreByUser.get(student.id) ?? {
        finalScore: 0,
        feedback: '',
      };
      return {
        userId: student.id,
        assignmentScore: {
          finalScore: assignmentScore.finalScore,
          maxScore,
          feedback: assignmentScore.feedback,
        },
        problems,
      };
    });
  }

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
    await this.problemScores.save(ps);
    await this.recomputeAssignmentScore(ap.assignmentId, studentId);
    await this.notifyStudentOfReview(studentId, actor.id, ap, ps.id);
    return ps;
  }

  private async notifyStudentOfReview(
    studentId: string,
    actorId: string,
    ap: AssignmentProblem,
    problemScoreId: string,
  ): Promise<void> {
    try {
      const problemTitle = ap.problem?.title ?? 'a problem';
      await this.notifications.createForRecipients({
        recipientIds: [studentId],
        actorId,
        type: NotificationType.FEEDBACK_RECEIVED,
        title: 'Your work was reviewed',
        message: `You received a grade and feedback on "${problemTitle}".`,
        entityType: 'problem_score',
        entityId: problemScoreId,
        link: '/home/assignments',
      });
    } catch (err) {
      this.logger.warn(`Failed to notify student ${studentId} of review: ${String(err)}`);
    }
  }

  async getAssignmentScore(assignmentId: string, actor: AuthenticatedUser) {
    await this.assertAssignmentExists(assignmentId);
    return this.readAssignmentScore(assignmentId, actor.id);
  }

  // ---- helpers ----

  private async buildStudentScore(assignmentId: string, userId: string) {
    const aps = await this.assignmentProblems.find({
      where: { assignmentId },
      relations: { problem: true },
    });
    const scores = await this.problemScores
      .createQueryBuilder('ps')
      .where('ps.user_id = :userId', { userId })
      .andWhere('ps.assignment_problem_id IN (:...ids)', {
        ids: aps.length ? aps.map((a) => a.id) : ['00000000-0000-0000-0000-000000000000'],
      })
      .getMany();
    const byAp = new Map(scores.map((s) => [s.assignmentProblemId, s]));

    const problems = aps.map((ap) => {
      const s = byAp.get(ap.id);
      return {
        assignmentProblemId: ap.id,
        problemId: ap.problemId,
        title: ap.problem?.title ?? '',
        maxScore: ap.score,
        score: s?.score ?? 0,
        submissionCount: s?.submissionCount ?? 0,
        solved: (s?.submissionId ?? null) !== null && (s?.score ?? 0) > 0,
        feedback: s?.feedback ?? '',
      };
    });

    const assignmentScore = await this.readAssignmentScore(assignmentId, userId);
    const maxScore = aps.reduce((sum, ap) => sum + ap.score, 0);
    return {
      userId,
      assignmentScore: {
        finalScore: assignmentScore.finalScore,
        maxScore,
        feedback: assignmentScore.feedback,
      },
      problems,
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

  private async recomputeAssignmentScore(assignmentId: string, userId: string): Promise<void> {
    const row = await this.problemScores
      .createQueryBuilder('ps')
      .innerJoin(AssignmentProblem, 'ap', 'ap.id = ps.assignment_problem_id')
      .where('ap.assignment_id = :assignmentId', { assignmentId })
      .andWhere('ps.user_id = :userId', { userId })
      .select('COALESCE(SUM(ps.score), 0)', 'total')
      .getRawOne<{ total: string }>();
    const total = Number(row?.total ?? 0);
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
