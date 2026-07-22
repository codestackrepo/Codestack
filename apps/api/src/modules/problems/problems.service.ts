import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { PaginatedResult } from '../../common/dto/pagination.dto';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CreateProblemDto } from './dto/create-problem.dto';
import { QueryProblemsDto } from './dto/query-problems.dto';
import { TestCaseInputDto } from './dto/test-case.dto';
import { UpdateProblemDto } from './dto/update-problem.dto';
import { Difficulty, ProblemSource, ProblemVisibility, TestCaseType } from './enums/problem.enums';
import { Problem } from './entities/problem.entity';
import { Tag } from './entities/tag.entity';
import { TestCase } from './entities/test-case.entity';

@Injectable()
export class ProblemsService {
  constructor(
    @InjectRepository(Problem) private readonly problems: Repository<Problem>,
    @InjectRepository(TestCase) private readonly testCases: Repository<TestCase>,
    @InjectRepository(Tag) private readonly tags: Repository<Tag>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateProblemDto, actor: AuthenticatedUser): Promise<Problem> {
    const id = await this.dataSource.transaction(async (manager) => {
      const tags = await this.resolveTags(dto.tags ?? [], manager.getRepository(Tag));
      const problem = manager.getRepository(Problem).create({
        title: dto.title,
        body: dto.body,
        difficulty: dto.difficulty ?? Difficulty.MEDIUM,
        visibility: dto.visibility ?? ProblemVisibility.SHARED,
        source: ProblemSource.HUMAN,
        createdById: actor.id,
        tags,
      });
      const saved = await manager.getRepository(Problem).save(problem);

      if (dto.testCases?.length) {
        const rows = dto.testCases.map((tc, i) =>
          manager.getRepository(TestCase).create({
            problemId: saved.id,
            inputData: tc.inputData,
            expectedOutput: tc.expectedOutput,
            type: tc.type ?? TestCaseType.HIDDEN,
            explanation: tc.explanation ?? '',
            isActive: tc.isActive ?? true,
            orderIndex: tc.orderIndex ?? i,
          }),
        );
        await manager.getRepository(TestCase).save(rows);
      }
      return saved.id;
    });
    return this.getById(id);
  }

  async findAll(
    query: QueryProblemsDto,
    actor: AuthenticatedUser,
  ): Promise<PaginatedResult<Problem>> {
    const qb = this.problems
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.tags', 'tag')
      .orderBy('p.createdAt', 'DESC');

    // Visibility: shared problems or the actor's own (private problems from
    // other users stay hidden). Admins see everything. NOTE: `source`
    // (human/ai provenance) must not be used as a visibility signal — every
    // human-created problem defaults to source=human, so gating on it here
    // would make PRIVATE meaningless for the dominant case.
    if (actor.role !== Role.ADMIN) {
      qb.andWhere('(p.visibility = :shared OR p.created_by_id = :uid)', {
        shared: ProblemVisibility.SHARED,
        uid: actor.id,
      });
    }

    if (query.difficulty)
      qb.andWhere('p.difficulty = :difficulty', { difficulty: query.difficulty });
    if (query.search) qb.andWhere('p.title ILIKE :search', { search: `%${query.search}%` });
    if (query.tag) {
      qb.andWhere(
        'p.id IN ' +
          qb
            .subQuery()
            .select('pt.problem_id')
            .from('problem_tags', 'pt')
            .innerJoin('tags', 't2', 't2.id = pt.tag_id')
            .where('t2.name = :tagName')
            .getQuery(),
      ).setParameter('tagName', query.tag);
    }

    const [data, total] = await qb.skip(query.skip).take(query.limit).getManyAndCount();
    return PaginatedResult.of(data, total, query);
  }

  async getById(id: string): Promise<Problem> {
    const problem = await this.problems.findOne({
      where: { id },
      relations: { tags: true },
    });
    if (!problem) throw new NotFoundException('Problem not found');
    return problem;
  }

  /** Full detail incl. test cases filtered by role (students see samples only). */
  async findOne(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<Problem & { testCases: TestCase[] }> {
    const problem = await this.getById(id);
    this.assertVisible(actor, problem);
    const testCases = await this.getTestCases(id, actor);
    return Object.assign(problem, { testCases });
  }

  /**
   * Direct-by-id access must respect the same visibility rule as findAll —
   * otherwise a PRIVATE problem is hidden from listings but still fully
   * readable (statement, tags, etc.) by anyone who has/guesses its id.
   */
  private assertVisible(actor: AuthenticatedUser, problem: Problem): void {
    if (actor.role === Role.ADMIN) return;
    if (problem.visibility === ProblemVisibility.SHARED) return;
    if (problem.createdById === actor.id) return;
    throw new ForbiddenException('You cannot view this problem');
  }

  async getTestCases(problemId: string, actor: AuthenticatedUser): Promise<TestCase[]> {
    const problem = await this.getById(problemId);
    this.assertVisible(actor, problem);
    const qb = this.testCases
      .createQueryBuilder('tc')
      .where('tc.problem_id = :problemId', { problemId })
      .andWhere('tc.is_active = true')
      .orderBy('tc.order_index', 'ASC');
    if (actor.role === Role.STUDENT) {
      qb.andWhere('tc.type = :sample', { sample: TestCaseType.SAMPLE });
    }
    return qb.getMany();
  }

  async update(id: string, dto: UpdateProblemDto, actor: AuthenticatedUser): Promise<Problem> {
    const problem = await this.getById(id);
    this.assertOwnerOrAdmin(actor, problem);

    if (dto.title !== undefined) problem.title = dto.title;
    if (dto.body !== undefined) problem.body = dto.body;
    if (dto.difficulty !== undefined) problem.difficulty = dto.difficulty;
    if (dto.visibility !== undefined) problem.visibility = dto.visibility;
    if (dto.tags !== undefined) problem.tags = await this.resolveTags(dto.tags, this.tags);

    return this.problems.save(problem);
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    const problem = await this.getById(id);
    this.assertOwnerOrAdmin(actor, problem);
    await this.problems.remove(problem);
  }

  async addTestCase(
    problemId: string,
    dto: TestCaseInputDto,
    actor: AuthenticatedUser,
  ): Promise<TestCase> {
    const problem = await this.getById(problemId);
    this.assertOwnerOrAdmin(actor, problem);
    const tc = this.testCases.create({
      problemId,
      inputData: dto.inputData,
      expectedOutput: dto.expectedOutput,
      type: dto.type ?? TestCaseType.HIDDEN,
      explanation: dto.explanation ?? '',
      isActive: dto.isActive ?? true,
      orderIndex: dto.orderIndex ?? 0,
    });
    return this.testCases.save(tc);
  }

  /** Deep-copies a problem and its active test cases into the actor's library. */
  async clone(id: string, actor: AuthenticatedUser): Promise<Problem> {
    const source = await this.getById(id);
    const activeCases = await this.testCases.find({
      where: { problemId: id, isActive: true },
    });
    const cloneId = await this.dataSource.transaction(async (manager) => {
      const copy = manager.getRepository(Problem).create({
        title: `${source.title} (copy)`,
        body: source.body,
        difficulty: source.difficulty,
        visibility: ProblemVisibility.PRIVATE,
        source: ProblemSource.HUMAN,
        createdById: actor.id,
        tags: source.tags,
      });
      const saved = await manager.getRepository(Problem).save(copy);
      if (activeCases.length) {
        const rows = activeCases.map((tc) =>
          manager.getRepository(TestCase).create({
            problemId: saved.id,
            inputData: tc.inputData,
            expectedOutput: tc.expectedOutput,
            type: tc.type,
            explanation: tc.explanation,
            isActive: tc.isActive,
            orderIndex: tc.orderIndex,
          }),
        );
        await manager.getRepository(TestCase).save(rows);
      }
      return saved.id;
    });
    return this.getById(cloneId);
  }

  private async resolveTags(names: string[], repo: Repository<Tag>): Promise<Tag[]> {
    const clean = [...new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean))];
    if (!clean.length) return [];
    const existing = await repo.find({ where: { name: In(clean) } });
    const existingNames = new Set(existing.map((t) => t.name));
    const toCreate = clean
      .filter((n) => !existingNames.has(n))
      .map((name) => repo.create({ name }));
    const created = toCreate.length ? await repo.save(toCreate) : [];
    return [...existing, ...created];
  }

  private assertOwnerOrAdmin(actor: AuthenticatedUser, problem: Problem): void {
    if (actor.role === Role.ADMIN) return;
    if (problem.createdById === actor.id) return;
    throw new ForbiddenException('You can only modify problems you created');
  }
}
