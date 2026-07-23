import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AssignmentsService } from './assignments.service';
import { AssignmentItemStudentDto } from './dto/assignment-item-response.dto';
import { SaveMcqResponseDto, SaveQuizResponseDto } from './dto/assignment-item.dto';
import { AssignmentAttempt } from './entities/assignment-attempt.entity';
import { AssignmentItem } from './entities/assignment-item.entity';
import { Assignment } from './entities/assignment.entity';
import { McqOption } from './entities/mcq-option.entity';
import { McqResponse } from './entities/mcq-response.entity';
import { QuizResponse } from './entities/quiz-response.entity';
import { AssignmentItemKind } from './enums/assignment-item-kind.enum';
import { AssignmentKind } from './enums/assignment-kind.enum';
import { AssignmentStatus } from './enums/assignment-status.enum';
import { AttemptStatus } from './enums/attempt-status.enum';

export interface TakePayload {
  assignmentId: string;
  kind: AssignmentKind;
  status: AssignmentStatus;
  items: AssignmentItemStudentDto[];
  attempt: { deadlineAt: Date; status: AttemptStatus } | null;
}

/**
 * Student-facing taking flow: fetch items (with `isCorrect`/scores stripped by
 * the student DTO), start a timed attempt, autosave/submit MCQ (auto-scored
 * server-side, hidden) and quiz responses, and submit the attempt — with
 * server-authoritative deadline enforcement for kind=test (§9.2, §9.9).
 */
@Injectable()
export class AssignmentTakingService {
  constructor(
    @InjectRepository(AssignmentItem) private readonly items: Repository<AssignmentItem>,
    @InjectRepository(McqOption) private readonly mcqOptions: Repository<McqOption>,
    @InjectRepository(McqResponse) private readonly mcqResponses: Repository<McqResponse>,
    @InjectRepository(QuizResponse) private readonly quizResponses: Repository<QuizResponse>,
    @InjectRepository(AssignmentAttempt)
    private readonly attempts: Repository<AssignmentAttempt>,
    private readonly assignmentsService: AssignmentsService,
  ) {}

  async getTake(assignmentId: string, actor: AuthenticatedUser): Promise<TakePayload> {
    // assertCanView enforces membership + status visibility + batch targeting.
    const assignment = await this.assignmentsService.findOne(assignmentId, actor);
    const items = await this.items.find({
      where: { assignmentId },
      relations: { options: true, assignmentProblem: { problem: true, languageTemplates: true } },
      order: { orderIndex: 'ASC' },
    });

    const itemIds = items.map((i) => i.id);
    const [mcq, quiz] = await Promise.all([
      itemIds.length
        ? this.mcqResponses.find({ where: { itemId: In(itemIds), userId: actor.id } })
        : Promise.resolve([]),
      itemIds.length
        ? this.quizResponses.find({ where: { itemId: In(itemIds), userId: actor.id } })
        : Promise.resolve([]),
    ]);
    const mcqByItem = new Map(mcq.map((r) => [r.itemId, r]));
    const quizByItem = new Map(quiz.map((r) => [r.itemId, r]));

    const attempt = await this.attempts.findOne({ where: { assignmentId, userId: actor.id } });

    return {
      assignmentId,
      kind: assignment.kind,
      status: assignment.status,
      items: items.map((item) =>
        AssignmentItemStudentDto.from(
          item,
          item.kind === AssignmentItemKind.QUIZ ? quizByItem.get(item.id) : mcqByItem.get(item.id),
        ),
      ),
      attempt: attempt ? { deadlineAt: attempt.deadlineAt, status: attempt.status } : null,
    };
  }

  async startAttempt(assignmentId: string, actor: AuthenticatedUser): Promise<AssignmentAttempt> {
    const assignment = await this.assignmentsService.findOne(assignmentId, actor);
    this.assertActive(assignment);

    const existing = await this.attempts.findOne({ where: { assignmentId, userId: actor.id } });
    if (existing) return existing; // idempotent

    const startedAt = new Date();
    const deadlineAt =
      assignment.kind === AssignmentKind.TEST && assignment.durationMinutes
        ? new Date(startedAt.getTime() + assignment.durationMinutes * 60_000)
        : assignment.endDate;

    return this.attempts.save(
      this.attempts.create({
        assignmentId,
        userId: actor.id,
        startedAt,
        deadlineAt,
        status: AttemptStatus.IN_PROGRESS,
      }),
    );
  }

  async saveMcqResponse(
    itemId: string,
    dto: SaveMcqResponseDto,
    actor: AuthenticatedUser,
  ): Promise<{ saved: true }> {
    const item = await this.getItemOrThrow(itemId, AssignmentItemKind.MCQ);
    const assignment = await this.assignmentsService.findOne(item.assignmentId, actor);
    this.assertActive(assignment);
    await this.assertWithinDeadline(assignment, actor);

    // Server-side auto-score: exact-set match against the correct options.
    const options = await this.mcqOptions.find({ where: { itemId } });
    const selected = new Set(dto.selectedOptionIds);
    const correct = new Set(options.filter((o) => o.isCorrect).map((o) => o.id));
    const exactMatch =
      selected.size === correct.size && [...selected].every((id) => correct.has(id));
    const awardedPoints = exactMatch ? item.maxPoints : 0;

    const existing = await this.mcqResponses.findOne({ where: { itemId, userId: actor.id } });
    if (existing) {
      existing.selectedOptionIds = dto.selectedOptionIds;
      existing.awardedPoints = awardedPoints;
      await this.mcqResponses.save(existing);
    } else {
      await this.mcqResponses.save(
        this.mcqResponses.create({
          itemId,
          userId: actor.id,
          selectedOptionIds: dto.selectedOptionIds,
          awardedPoints,
        }),
      );
    }
    // Never leak the score/correctness back to the student.
    return { saved: true };
  }

  async saveQuizResponse(
    itemId: string,
    dto: SaveQuizResponseDto,
    actor: AuthenticatedUser,
  ): Promise<{ saved: true }> {
    const item = await this.getItemOrThrow(itemId, AssignmentItemKind.QUIZ);
    const assignment = await this.assignmentsService.findOne(item.assignmentId, actor);
    this.assertActive(assignment);
    await this.assertWithinDeadline(assignment, actor);

    const existing = await this.quizResponses.findOne({ where: { itemId, userId: actor.id } });
    if (existing) {
      existing.answerText = dto.answerText;
      await this.quizResponses.save(existing);
    } else {
      await this.quizResponses.save(
        // awardedPoints stays null — a professor grades quiz items (issue #21).
        this.quizResponses.create({ itemId, userId: actor.id, answerText: dto.answerText }),
      );
    }
    return { saved: true };
  }

  async submitAttempt(assignmentId: string, actor: AuthenticatedUser): Promise<AssignmentAttempt> {
    await this.assignmentsService.findOne(assignmentId, actor);
    const attempt = await this.attempts.findOne({ where: { assignmentId, userId: actor.id } });
    if (!attempt) throw new BadRequestException('No attempt has been started');
    if (attempt.status === AttemptStatus.IN_PROGRESS) {
      attempt.status = AttemptStatus.SUBMITTED;
      attempt.submittedAt = new Date();
      await this.attempts.save(attempt);
    }
    return attempt;
  }

  // ---- helpers ----

  private assertActive(assignment: Assignment): void {
    if (assignment.status !== AssignmentStatus.ACTIVE) {
      throw new ForbiddenException('This assignment is not open for responses');
    }
  }

  /**
   * Server-authoritative deadline enforcement for timed tests (§9.9): the
   * client countdown is untrusted. Non-test assignments have no per-attempt
   * deadline gate here (they close via status).
   */
  private async assertWithinDeadline(
    assignment: Assignment,
    actor: AuthenticatedUser,
  ): Promise<void> {
    if (assignment.kind !== AssignmentKind.TEST) return;
    const attempt = await this.attempts.findOne({
      where: { assignmentId: assignment.id, userId: actor.id },
    });
    if (!attempt) {
      throw new ForbiddenException('Start the test before submitting responses');
    }
    if (new Date() > attempt.deadlineAt) {
      throw new ForbiddenException('The test deadline has passed');
    }
  }

  private async getItemOrThrow(
    itemId: string,
    expectedKind: AssignmentItemKind,
  ): Promise<AssignmentItem> {
    const item = await this.items.findOne({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Assignment item not found');
    if (item.kind !== expectedKind) {
      throw new BadRequestException(`Item is not a ${expectedKind} item`);
    }
    return item;
  }
}
