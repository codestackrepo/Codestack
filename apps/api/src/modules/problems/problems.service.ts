import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
import { PaginatedResult } from '../../common/dto/pagination.dto';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { isSuperAdmin } from '../../common/tenancy/tenant-scope.util';
import { CreateProblemDto } from './dto/create-problem.dto';
import { QueryProblemsDto } from './dto/query-problems.dto';
import { TestCaseInputDto } from './dto/test-case.dto';
import { UpdateProblemDto } from './dto/update-problem.dto';
import {
  Difficulty,
  ProblemScope,
  ProblemSource,
  ProblemVisibility,
  TestCaseType,
} from './enums/problem.enums';
import { Language } from '../../common/enums/language.enum';
import { Company } from './entities/company.entity';
import { LibraryProblemTemplate } from './entities/library-problem-template.entity';
import { Problem } from './entities/problem.entity';
import { Tag } from './entities/tag.entity';
import { TestCase } from './entities/test-case.entity';

export interface FacetCount {
  name: string;
  count: number;
}

/** Pieces the practice code-editor screen needs to bootstrap (§9.11). */
export interface ProblemEditorBootstrap {
  problem: Problem;
  sampleCases: TestCase[];
  templates: { language: Language; starterCode: string }[];
}

@Injectable()
export class ProblemsService {
  constructor(
    @InjectRepository(Problem) private readonly problems: Repository<Problem>,
    @InjectRepository(TestCase) private readonly testCases: Repository<TestCase>,
    @InjectRepository(Tag) private readonly tags: Repository<Tag>,
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    @InjectRepository(LibraryProblemTemplate)
    private readonly libraryTemplates: Repository<LibraryProblemTemplate>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateProblemDto, actor: AuthenticatedUser): Promise<Problem> {
    const superAdmin = isSuperAdmin(actor);
    // scope is server-derived from the actor's role; a non-superadmin cannot forge global.
    if (dto.scope === ProblemScope.GLOBAL && !superAdmin) {
      throw new ForbiddenException('Only a platform superadmin can create global problems');
    }
    const id = await this.dataSource.transaction(async (manager) => {
      const tags = await this.resolveTags(dto.tags ?? [], manager.getRepository(Tag));
      const companies = await this.resolveCompanies(
        dto.companies ?? [],
        manager.getRepository(Company),
      );
      const problem = manager.getRepository(Problem).create({
        title: dto.title,
        body: dto.body,
        difficulty: dto.difficulty ?? Difficulty.MEDIUM,
        // Superadmin globals default to PRIVATE (draft); org staff keep SHARED.
        visibility:
          dto.visibility ?? (superAdmin ? ProblemVisibility.PRIVATE : ProblemVisibility.SHARED),
        scope: superAdmin ? ProblemScope.GLOBAL : ProblemScope.ORG,
        organizationId: superAdmin ? null : actor.organizationId,
        source: ProblemSource.HUMAN,
        createdById: actor.id,
        tags,
        companies,
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
      .leftJoinAndSelect('p.companies', 'company')
      .orderBy('p.createdAt', 'DESC');

    // The SINGLE catalog visibility predicate (#56): published globals + own-org
    // shared + own; superadmin unrestricted; org-admin sees all of its own org.
    this.applyVisibility(qb, 'p', actor);

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
    if (query.company) {
      qb.andWhere(
        'p.id IN ' +
          qb
            .subQuery()
            .select('pc.problem_id')
            .from('problem_companies', 'pc')
            .innerJoin('companies', 'c2', 'c2.id = pc.company_id')
            .where('c2.name = :companyName')
            .getQuery(),
      ).setParameter('companyName', query.company);
    }

    const [data, total] = await qb.skip(query.skip).take(query.limit).getManyAndCount();
    return PaginatedResult.of(data, total, query);
  }

  /**
   * Available facet values (with problem counts) for the catalog filter UI,
   * scoped to problems the actor can see. Returns topic tags + companies.
   */
  async getFacets(
    actor: AuthenticatedUser,
  ): Promise<{ tags: FacetCount[]; companies: FacetCount[] }> {
    const [tags, companies] = await Promise.all([
      this.facetCounts('problem_tags', 'tags', actor),
      this.facetCounts('problem_companies', 'companies', actor),
    ]);
    return { tags, companies };
  }

  private async facetCounts(
    joinTable: string,
    facetTable: 'tags' | 'companies',
    actor: AuthenticatedUser,
  ): Promise<FacetCount[]> {
    const joinCol = facetTable === 'tags' ? 'tag_id' : 'company_id';
    const qb = this.dataSource
      .createQueryBuilder()
      .select('f.name', 'name')
      .addSelect('COUNT(DISTINCT p.id)', 'count')
      .from(facetTable, 'f')
      .innerJoin(joinTable, 'j', `j.${joinCol} = f.id`)
      .innerJoin('problems', 'p', 'p.id = j.problem_id')
      .groupBy('f.name')
      .orderBy('count', 'DESC')
      .addOrderBy('f.name', 'ASC');
    // Same single predicate — critical here: this is a metadata-less raw builder,
    // so applyVisibility emits raw snake_case columns and must be applied or facet
    // names/counts leak other orgs' + global-draft problem existence.
    this.applyVisibility(qb, 'p', actor);
    const rows = await qb.getRawMany<{ name: string; count: string }>();
    return rows.map((r) => ({ name: r.name, count: Number(r.count) }));
  }

  async getById(id: string): Promise<Problem> {
    const problem = await this.problems.findOne({
      where: { id },
      relations: { tags: true, companies: true },
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
    if (isSuperAdmin(actor)) return;
    const publishedGlobal =
      problem.scope === ProblemScope.GLOBAL && problem.visibility === ProblemVisibility.SHARED;
    // Guard the org compare against a null actor org (SQL `col = NULL` is never
    // true) so a mis-provisioned org-less non-superadmin can't match a global's null org.
    const sameOrg =
      actor.organizationId != null && problem.organizationId === actor.organizationId;
    if (actor.role === Role.ADMIN) {
      if (sameOrg) return; // all of the admin's own org
      if (publishedGlobal) return;
      throw new ForbiddenException('You cannot view this problem');
    }
    // PROFESSOR / STUDENT
    if (publishedGlobal) return;
    if (sameOrg && problem.visibility === ProblemVisibility.SHARED) return;
    if (problem.createdById === actor.id) return;
    throw new ForbiddenException('You cannot view this problem');
  }

  /**
   * The SINGLE catalog visibility predicate (#56). Emits RAW snake_case column
   * SQL so it works on BOTH the repository builder (findAll) and the
   * metadata-less raw dataSource builder (facetCounts). Always uses andWhere —
   * TypeORM promotes the first andWhere to the leading WHERE — and namespaced
   * :__vis* params never clobber caller binds.
   */
  private applyVisibility<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    alias: string,
    actor: AuthenticatedUser,
  ): void {
    if (isSuperAdmin(actor)) return;
    const publishedGlobal = `(${alias}.scope = :__visGlobal AND ${alias}.visibility = :__visShared)`;
    const params = {
      __visGlobal: ProblemScope.GLOBAL,
      __visShared: ProblemVisibility.SHARED,
      __visOrg: actor.organizationId,
      __visUid: actor.id,
    };
    if (actor.role === Role.ADMIN) {
      qb.andWhere(`(${alias}.organization_id = :__visOrg OR ${publishedGlobal})`, params);
      return;
    }
    qb.andWhere(
      `(${publishedGlobal}` +
        ` OR (${alias}.organization_id = :__visOrg AND ${alias}.visibility = :__visShared)` +
        ` OR ${alias}.created_by_id = :__visUid)`,
      params,
    );
  }

  /**
   * Direct-by-id read enforcing the SAME rule as findAll. getById stays
   * UNGUARDED (write paths call it before assertOwnerOrAdmin); this is the gated
   * read entry point, reused by findOne and by AssignmentsService import/clone (#57).
   */
  async getVisible(id: string, actor: AuthenticatedUser): Promise<Problem> {
    const problem = await this.getById(id);
    this.assertVisible(actor, problem);
    return problem;
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

  /**
   * Everything the practice code-editor screen needs to bootstrap: statement,
   * SAMPLE testcases only, and per-language starter code. NEVER returns
   * driverCode or hidden test cases — the judge harness stays server-side.
   * Respects catalog visibility (same rule as findOne).
   */
  async getEditorBootstrap(id: string, actor: AuthenticatedUser): Promise<ProblemEditorBootstrap> {
    const problem = await this.getById(id);
    this.assertVisible(actor, problem);
    const sampleCases = await this.testCases.find({
      where: { problemId: id, type: TestCaseType.SAMPLE, isActive: true },
      order: { orderIndex: 'ASC' },
    });
    const templates = await this.libraryTemplates.find({
      where: { problemId: id },
      order: { language: 'ASC' },
    });
    return {
      problem,
      sampleCases,
      templates: templates.map((t) => ({ language: t.language, starterCode: t.starterCode })),
    };
  }

  async update(id: string, dto: UpdateProblemDto, actor: AuthenticatedUser): Promise<Problem> {
    const problem = await this.getById(id);
    this.assertOwnerOrAdmin(actor, problem);

    if (dto.title !== undefined) problem.title = dto.title;
    if (dto.body !== undefined) problem.body = dto.body;
    if (dto.difficulty !== undefined) problem.difficulty = dto.difficulty;
    if (dto.visibility !== undefined) problem.visibility = dto.visibility;
    if (dto.tags !== undefined) problem.tags = await this.resolveTags(dto.tags, this.tags);
    if (dto.companies !== undefined)
      problem.companies = await this.resolveCompanies(dto.companies, this.companies);

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
    const source = await this.getVisible(id, actor); // cannot clone what you cannot see
    const superAdmin = isSuperAdmin(actor);
    const activeCases = await this.testCases.find({
      where: { problemId: id, isActive: true },
    });
    const cloneId = await this.dataSource.transaction(async (manager) => {
      const copy = manager.getRepository(Problem).create({
        title: `${source.title} (copy)`,
        body: source.body,
        difficulty: source.difficulty,
        visibility: ProblemVisibility.PRIVATE,
        scope: superAdmin ? ProblemScope.GLOBAL : ProblemScope.ORG,
        organizationId: superAdmin ? null : actor.organizationId,
        source: ProblemSource.HUMAN,
        createdById: actor.id,
        tags: source.tags,
        companies: source.companies,
        functionName: source.functionName,
        ioSpec: source.ioSpec,
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

  /** Find-or-create companies by name (same normalization as tags). */
  private async resolveCompanies(names: string[], repo: Repository<Company>): Promise<Company[]> {
    const clean = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
    if (!clean.length) return [];
    const existing = await repo.find({ where: { name: In(clean) } });
    const existingNames = new Set(existing.map((c) => c.name));
    const toCreate = clean
      .filter((n) => !existingNames.has(n))
      .map((name) => repo.create({ name }));
    const created = toCreate.length ? await repo.save(toCreate) : [];
    return [...existing, ...created];
  }

  private assertOwnerOrAdmin(actor: AuthenticatedUser, problem: Problem): void {
    if (isSuperAdmin(actor)) return;
    if (problem.createdById === actor.id) return;
    // Org-admin may manage problems in its OWN org only — never globals, never
    // another org (globals are superadmin-only, PLATFORM-PLAN §10).
    if (
      actor.role === Role.ADMIN &&
      actor.organizationId != null &&
      problem.organizationId === actor.organizationId
    ) {
      return;
    }
    throw new ForbiddenException('You can only modify problems you created');
  }
}
