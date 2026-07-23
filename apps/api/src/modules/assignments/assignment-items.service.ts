import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AssignmentsService } from './assignments.service';
import { syncCodingPoints } from './coding-points.util';
import {
  CreateAssignmentItemDto,
  McqOptionInputDto,
  UpdateAssignmentItemDto,
} from './dto/assignment-item.dto';
import { AssignmentItem } from './entities/assignment-item.entity';
import { AssignmentProblem } from './entities/assignment-problem.entity';
import { McqOption } from './entities/mcq-option.entity';
import { AssignmentItemGradingMode } from './enums/assignment-item-grading-mode.enum';
import { AssignmentItemKind } from './enums/assignment-item-kind.enum';

/**
 * Staff authoring of mixed assignment items (coding | mcq | quiz). Coding items
 * delegate to AssignmentsService's import path (AP + templates) and are then
 * wrapped 1:1; coding points stay synced with AssignmentProblem.score via the
 * shared syncCodingPoints helper (issue #20).
 */
@Injectable()
export class AssignmentItemsService {
  private static readonly ITEM_RELATIONS = {
    options: true,
    assignmentProblem: { problem: true, languageTemplates: true },
  } as const;

  constructor(
    @InjectRepository(AssignmentItem) private readonly items: Repository<AssignmentItem>,
    @InjectRepository(McqOption) private readonly mcqOptions: Repository<McqOption>,
    @InjectRepository(AssignmentProblem)
    private readonly assignmentProblems: Repository<AssignmentProblem>,
    private readonly assignmentsService: AssignmentsService,
    private readonly dataSource: DataSource,
  ) {}

  async listItems(assignmentId: string, actor: AuthenticatedUser): Promise<AssignmentItem[]> {
    await this.assignmentsService.assertCanManageById(assignmentId, actor);
    return this.items.find({
      where: { assignmentId },
      relations: AssignmentItemsService.ITEM_RELATIONS,
      order: { orderIndex: 'ASC' },
    });
  }

  async createItem(
    assignmentId: string,
    dto: CreateAssignmentItemDto,
    actor: AuthenticatedUser,
  ): Promise<AssignmentItem> {
    await this.assignmentsService.assertCanManageById(assignmentId, actor);
    const orderIndex = dto.orderIndex ?? (await this.nextOrderIndex(assignmentId));

    if (dto.kind === AssignmentItemKind.CODING) {
      return this.createCodingItem(assignmentId, dto, orderIndex, actor);
    }
    if (dto.kind === AssignmentItemKind.MCQ) {
      this.validateMcqOptions(dto.options, dto.allowMultiple ?? false);
      const itemId = await this.dataSource.transaction(async (m) => {
        const item = await m.getRepository(AssignmentItem).save(
          m.getRepository(AssignmentItem).create({
            assignmentId,
            kind: AssignmentItemKind.MCQ,
            orderIndex,
            maxPoints: dto.maxPoints ?? 0,
            prompt: dto.prompt ?? '',
            gradingMode: AssignmentItemGradingMode.AUTO,
            allowMultiple: dto.allowMultiple ?? false,
          }),
        );
        await m.getRepository(McqOption).save(this.buildOptions(item.id, dto.options ?? []));
        return item.id;
      });
      return this.getItemOrThrow(itemId);
    }
    // quiz
    const item = await this.items.save(
      this.items.create({
        assignmentId,
        kind: AssignmentItemKind.QUIZ,
        orderIndex,
        maxPoints: dto.maxPoints ?? 0,
        prompt: dto.prompt ?? '',
        gradingMode: AssignmentItemGradingMode.MANUAL,
        allowMultiple: false,
      }),
    );
    return this.getItemOrThrow(item.id);
  }

  async updateItem(
    itemId: string,
    dto: UpdateAssignmentItemDto,
    actor: AuthenticatedUser,
  ): Promise<AssignmentItem> {
    const item = await this.getItemOrThrow(itemId);
    await this.assignmentsService.assertCanManageById(item.assignmentId, actor);

    if (dto.prompt !== undefined) item.prompt = dto.prompt;
    if (dto.orderIndex !== undefined) item.orderIndex = dto.orderIndex;

    if (dto.maxPoints !== undefined) {
      if (item.kind === AssignmentItemKind.CODING && item.assignmentProblemId) {
        // Writing coding points must also update AssignmentProblem.score.
        await syncCodingPoints(this.dataSource.manager, item.assignmentProblemId, dto.maxPoints);
      }
      item.maxPoints = dto.maxPoints;
    }

    if (item.kind === AssignmentItemKind.MCQ) {
      if (dto.allowMultiple !== undefined) item.allowMultiple = dto.allowMultiple;
      if (dto.options) {
        this.validateMcqOptions(dto.options, dto.allowMultiple ?? item.allowMultiple);
        await this.mcqOptions.delete({ itemId: item.id });
        await this.mcqOptions.save(this.buildOptions(item.id, dto.options));
      }
    }

    await this.items.save(item);
    return this.getItemOrThrow(itemId);
  }

  async deleteItem(itemId: string, actor: AuthenticatedUser): Promise<void> {
    const item = await this.getItemOrThrow(itemId);
    await this.assignmentsService.assertCanManageById(item.assignmentId, actor);
    if (item.kind === AssignmentItemKind.CODING && item.assignmentProblemId) {
      // The item wraps the AP 1:1 — removing the AP cascades to the item
      // (assignment_items.assignment_problem_id FK is ON DELETE CASCADE).
      await this.assignmentsService.deleteAssignmentProblem(item.assignmentProblemId, actor);
    } else {
      await this.items.remove(item);
    }
  }

  async reorder(
    assignmentId: string,
    orderedItemIds: string[],
    actor: AuthenticatedUser,
  ): Promise<AssignmentItem[]> {
    await this.assignmentsService.assertCanManageById(assignmentId, actor);
    const items = await this.items.find({ where: { assignmentId } });
    const byId = new Map(items.map((i) => [i.id, i]));
    orderedItemIds.forEach((id, index) => {
      const item = byId.get(id);
      if (item) item.orderIndex = index;
    });
    await this.items.save([...byId.values()]);
    return this.listItems(assignmentId, actor);
  }

  // ---- helpers ----

  private async createCodingItem(
    assignmentId: string,
    dto: CreateAssignmentItemDto,
    orderIndex: number,
    actor: AuthenticatedUser,
  ): Promise<AssignmentItem> {
    if (!dto.sourceProblemId || !dto.languages?.length) {
      throw new BadRequestException(
        'Coding items require sourceProblemId and at least one language',
      );
    }
    // Reuse the existing import path (creates the AP + ProblemTemplates and
    // fires the "problem added" notification), then wrap it in an item.
    const ap = await this.assignmentsService.importProblem(
      assignmentId,
      { sourceProblemId: dto.sourceProblemId, score: dto.score ?? 0, languages: dto.languages },
      actor,
    );
    const item = await this.items.save(
      this.items.create({
        assignmentId,
        kind: AssignmentItemKind.CODING,
        orderIndex,
        maxPoints: ap.score,
        prompt: '',
        gradingMode: AssignmentItemGradingMode.MANUAL,
        allowMultiple: false,
        assignmentProblemId: ap.id,
      }),
    );
    await this.assignmentProblems.update(ap.id, { assignmentItemId: item.id });
    return this.getItemOrThrow(item.id);
  }

  private buildOptions(itemId: string, options: McqOptionInputDto[]): McqOption[] {
    return options.map((o, i) =>
      this.mcqOptions.create({
        itemId,
        text: o.text,
        isCorrect: o.isCorrect,
        orderIndex: o.orderIndex ?? i,
      }),
    );
  }

  private validateMcqOptions(
    options: McqOptionInputDto[] | undefined,
    allowMultiple: boolean,
  ): void {
    if (!options || options.length < 2) {
      throw new BadRequestException('An MCQ item requires at least 2 options');
    }
    const correct = options.filter((o) => o.isCorrect).length;
    if (correct < 1) {
      throw new BadRequestException('An MCQ item requires at least one correct option');
    }
    if (!allowMultiple && correct !== 1) {
      throw new BadRequestException('A single-answer MCQ must have exactly one correct option');
    }
  }

  private async nextOrderIndex(assignmentId: string): Promise<number> {
    const max = await this.items
      .createQueryBuilder('i')
      .select('COALESCE(MAX(i.order_index), -1)', 'max')
      .where('i.assignment_id = :assignmentId', { assignmentId })
      .getRawOne<{ max: string }>();
    return Number(max?.max ?? -1) + 1;
  }

  private async getItemOrThrow(itemId: string): Promise<AssignmentItem> {
    const item = await this.items.findOne({
      where: { id: itemId },
      relations: AssignmentItemsService.ITEM_RELATIONS,
    });
    if (!item) throw new NotFoundException('Assignment item not found');
    return item;
  }
}
