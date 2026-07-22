import { Injectable } from '@nestjs/common';
import { DataSource, In, Repository } from 'typeorm';
import { Language } from '../../../common/enums/language.enum';
import { LibraryProblemTemplate } from '../../problems/entities/library-problem-template.entity';
import { Problem } from '../../problems/entities/problem.entity';
import { Tag } from '../../problems/entities/tag.entity';
import { TestCase } from '../../problems/entities/test-case.entity';
import {
  Difficulty,
  ProblemSource,
  ProblemVisibility,
  TestCaseType,
} from '../../problems/enums/problem.enums';
import { DriverSynthService } from '../driver-synth/driver-synth.service';
import { encodeExpectedOutput, encodeStdin } from '../driver-synth/io-codec';
import { PerLanguagePass } from '../entities/generated-problem-link.entity';
import { GeneratedProblem, TestCaseIo } from '../llm/schemas/generated-problem.schema';

const DIFFICULTY_MAP: Record<GeneratedProblem['difficulty'], Difficulty> = {
  easy: Difficulty.EASY,
  medium: Difficulty.MEDIUM,
  hard: Difficulty.HARD,
};

/**
 * Turns a self-validated GeneratedProblem into real Problem/TestCase/
 * LibraryProblemTemplate rows — the exact same entities a human-authored
 * problem uses, so generated problems are solvable through the ordinary
 * judge with zero special-casing downstream. Only languages that passed
 * self-validation get a LibraryProblemTemplate; a failing language is simply
 * omitted rather than materialized with a broken driver.
 */
@Injectable()
export class MaterializerService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly driverSynth: DriverSynthService,
  ) {}

  async materialize(
    problem: GeneratedProblem,
    perLanguagePass: PerLanguagePass,
    generationRequestId: string,
    userId: string,
  ): Promise<Problem> {
    return this.dataSource.transaction(async (manager) => {
      const tags = await this.resolveTags(problem.tags, manager.getRepository(Tag));

      const problemRepo = manager.getRepository(Problem);
      const saved = await problemRepo.save(
        problemRepo.create({
          title: problem.title,
          body: this.buildBody(problem),
          difficulty: DIFFICULTY_MAP[problem.difficulty],
          source: ProblemSource.AI,
          visibility: ProblemVisibility.PRIVATE,
          generationRequestId,
          createdById: userId,
          tags,
        }),
      );

      const testCaseRepo = manager.getRepository(TestCase);
      const rows = [
        ...problem.sample_testcases.map((tc) => ({ tc, type: TestCaseType.SAMPLE })),
        ...problem.hidden_testcases.map((tc) => ({ tc, type: TestCaseType.HIDDEN })),
      ].map(({ tc, type }, orderIndex) =>
        testCaseRepo.create(this.buildTestCase(saved.id, problem, tc, type, orderIndex)),
      );
      await testCaseRepo.save(rows);

      const passingLanguages = (Object.values(Language) as Language[]).filter(
        (language) => perLanguagePass[language],
      );
      if (passingLanguages.length) {
        const templateRepo = manager.getRepository(LibraryProblemTemplate);
        const templates = passingLanguages.map((language) =>
          templateRepo.create({
            problemId: saved.id,
            language,
            starterCode: problem.starter_code[language],
            driverCode: this.driverSynth.synthesize(
              language,
              problem.function_name,
              problem.io_spec,
            ),
            createdById: userId,
          }),
        );
        await templateRepo.save(templates);
      }

      return saved;
    });
  }

  private buildBody(problem: GeneratedProblem): string {
    const constraints = problem.constraints.map((c) => `- ${c}`).join('\n');
    return `${problem.statement_markdown}\n\n**Constraints:**\n\n${constraints}`;
  }

  private buildTestCase(
    problemId: string,
    problem: GeneratedProblem,
    tc: TestCaseIo,
    type: TestCaseType,
    orderIndex: number,
  ) {
    return {
      problemId,
      inputData: encodeStdin(problem.io_spec, tc.inputs),
      expectedOutput: encodeExpectedOutput(tc.expected),
      type,
      explanation: tc.explanation ?? '',
      isActive: true,
      orderIndex,
    };
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
}
