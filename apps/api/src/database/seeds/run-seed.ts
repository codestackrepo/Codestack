import 'reflect-metadata';
import * as argon2 from 'argon2';
import dataSource from '../data-source';
import { Role } from '../../common/enums/role.enum';
import { Language } from '../../common/enums/language.enum';
import { User } from '../../modules/users/entities/user.entity';
import { Classroom } from '../../modules/classrooms/entities/classroom.entity';
import { LEGACY_ORG_ID } from '../../modules/organizations/organizations.constants';
import { Tag } from '../../modules/problems/entities/tag.entity';
import { Problem } from '../../modules/problems/entities/problem.entity';
import { TestCase } from '../../modules/problems/entities/test-case.entity';
import { LibraryProblemTemplate } from '../../modules/problems/entities/library-problem-template.entity';
import {
  Difficulty,
  ProblemSource,
  ProblemVisibility,
  TestCaseType,
} from '../../modules/problems/enums/problem.enums';
import { Assignment } from '../../modules/assignments/entities/assignment.entity';
import { AssignmentProblem } from '../../modules/assignments/entities/assignment-problem.entity';
import { ProblemTemplate } from '../../modules/assignments/entities/problem-template.entity';
import { AssignmentStatus } from '../../modules/assignments/enums/assignment-status.enum';
// Billing plans are no longer seeded (M0 — "Disable & hide AI + Billing").

// Must survive Clerk's sign-in policy, not just our own argon2 check: Clerk
// rejects a password found in a breach corpus (the old 'Password1!' is in one),
// so a seeded account with a weak password cannot log in once Clerk is enabled.
const PASSWORD = 'CodeStack#Dev2026!';

/**
 * Idempotent local-dev seed: an admin, a professor, three students, one
 * classroom, one library problem (with test cases + per-language library
 * templates), and one active assignment with that problem attached.
 *
 * Safe to re-run — every step checks for an existing row by its natural key
 * before creating.
 */
async function main(): Promise<void> {
  await dataSource.initialize();
  console.log('Connected. Seeding...');

  const passwordHash = await argon2.hash(PASSWORD);

  const admin = await upsertUser('admin@codestack.dev', Role.ADMIN, 'Ada', 'Admin', passwordHash);
  const professor = await upsertUser(
    'professor@codestack.dev',
    Role.PROFESSOR,
    'Grace',
    'Hopper',
    passwordHash,
  );
  const alice = await upsertUser(
    'alice@codestack.dev',
    Role.STUDENT,
    'Alice',
    'Nguyen',
    passwordHash,
  );
  const bob = await upsertUser('bob@codestack.dev', Role.STUDENT, 'Bob', 'Singh', passwordHash);
  const carol = await upsertUser(
    'carol@codestack.dev',
    Role.STUDENT,
    'Carol',
    'Diaz',
    passwordHash,
  );

  const classroom = await upsertClassroom(
    'SEED-CS101',
    'CodeStack Seed — Intro to Algorithms',
    professor,
    admin,
    [alice, bob, carol],
    [carol], // carol also grades
  );

  const problem = await upsertProblem(
    'CodeStack Seed — Second Largest Element',
    [
      'Given an array of integers, return the second largest **distinct** value.',
      '',
      '### Constraints',
      '- `2 <= n <= 10^5`',
      '- The array contains at least two distinct values.',
    ].join('\n'),
    Difficulty.EASY,
    ['arrays', 'sorting'],
    professor,
  );

  await upsertTestCase(
    problem,
    '[1, 2, 3, 4]',
    '3',
    TestCaseType.SAMPLE,
    'Sorted distinct values: 4 is largest, 3 is second.',
    0,
  );
  await upsertTestCase(problem, '[10, 5, 10, 8]', '8', TestCaseType.HIDDEN, '', 1);
  await upsertTestCase(problem, '[-1, -2, -3]', '-2', TestCaseType.HIDDEN, '', 2);
  await upsertTestCase(
    problem,
    '[5, 5, 5, 2]',
    '2',
    TestCaseType.HIDDEN,
    'Duplicate max values collapse to one.',
    3,
  );

  await upsertLibraryTemplate(
    problem,
    Language.PYTHON,
    'def second_largest(nums: list[int]) -> int:\n    # TODO: implement\n    pass\n',
    'import ast, sys\n\n{{user_code}}\n\ndef main():\n    nums = ast.literal_eval(sys.stdin.read().strip())\n    print(second_largest(nums))\n\nmain()\n',
    professor,
  );
  await upsertLibraryTemplate(
    problem,
    Language.JAVASCRIPT,
    'function secondLargest(nums) {\n  // TODO: implement\n}\n',
    'const readline = require("readline");\nconst rl = readline.createInterface({ input: process.stdin });\nlet input = "";\nrl.on("line", (l) => (input += l));\nrl.on("close", () => {\n  const nums = JSON.parse(input.trim());\n\n  {{user_code}}\n\n  console.log(secondLargest(nums));\n});\n',
    professor,
  );

  const assignment = await upsertAssignment('Week 1 — Arrays Warmup', classroom, professor);
  await upsertAssignmentProblem(assignment, problem, 10, [Language.PYTHON, Language.JAVASCRIPT]);

  console.log('\nSeed complete. Login with any of:');
  console.log(
    `  admin@codestack.dev / professor@codestack.dev / alice@codestack.dev / bob@codestack.dev / carol@codestack.dev`,
  );
  console.log(`  password: ${PASSWORD}`);

  await dataSource.destroy();
}

async function upsertUser(
  email: string,
  role: Role,
  firstName: string,
  lastName: string,
  passwordHash: string,
): Promise<User> {
  const repo = dataSource.getRepository(User);
  const existing = await repo.findOne({ where: { email } });
  if (existing) return existing;
  return repo.save(
    repo.create({ email, role, firstName, lastName, passwordHash, isActive: true, organizationId: LEGACY_ORG_ID }),
  );
}

async function upsertClassroom(
  courseId: string,
  title: string,
  professor: User,
  createdBy: User,
  students: User[],
  graders: User[],
): Promise<Classroom> {
  const repo = dataSource.getRepository(Classroom);
  const existing = await repo.findOne({
    where: { courseId },
    relations: { professor: true, students: true, graders: true },
  });
  if (existing) return existing;
  const classroom = repo.create({
    organizationId: LEGACY_ORG_ID,
    courseId,
    title,
    description: 'Seeded classroom for local development.',
    term: 'Spring 2026',
    startDate: new Date('2026-07-01T00:00:00Z'),
    endDate: new Date('2026-12-15T00:00:00Z'),
    createdById: createdBy.id,
    professor,
    professorId: professor.id,
    students,
    graders,
    totalUsers: students.length + graders.length + 1,
  });
  return repo.save(classroom);
}

async function upsertProblem(
  title: string,
  body: string,
  difficulty: Difficulty,
  tagNames: string[],
  createdBy: User,
): Promise<Problem> {
  const problems = dataSource.getRepository(Problem);
  const tags = dataSource.getRepository(Tag);
  const existing = await problems.findOne({ where: { title }, relations: { tags: true } });
  if (existing) return existing;

  const tagEntities: Tag[] = [];
  for (const name of tagNames) {
    let tag = await tags.findOne({ where: { name } });
    if (!tag) tag = await tags.save(tags.create({ name }));
    tagEntities.push(tag);
  }

  return problems.save(
    problems.create({
      title,
      body,
      difficulty,
      source: ProblemSource.HUMAN,
      visibility: ProblemVisibility.SHARED,
      createdById: createdBy.id,
      tags: tagEntities,
    }),
  );
}

async function upsertTestCase(
  problem: Problem,
  inputData: string,
  expectedOutput: string,
  type: TestCaseType,
  explanation: string,
  orderIndex: number,
): Promise<TestCase> {
  const repo = dataSource.getRepository(TestCase);
  const existing = await repo.findOne({ where: { problemId: problem.id, orderIndex } });
  if (existing) return existing;
  return repo.save(
    repo.create({
      problemId: problem.id,
      inputData,
      expectedOutput,
      type,
      explanation,
      isActive: true,
      orderIndex,
    }),
  );
}

async function upsertLibraryTemplate(
  problem: Problem,
  language: Language,
  starterCode: string,
  driverCode: string,
  createdBy: User,
): Promise<LibraryProblemTemplate> {
  const repo = dataSource.getRepository(LibraryProblemTemplate);
  const existing = await repo.findOne({ where: { problemId: problem.id, language } });
  if (existing) return existing;
  return repo.save(
    repo.create({
      problemId: problem.id,
      language,
      starterCode,
      driverCode,
      createdById: createdBy.id,
    }),
  );
}

async function upsertAssignment(
  title: string,
  classroom: Classroom,
  createdBy: User,
): Promise<Assignment> {
  const repo = dataSource.getRepository(Assignment);
  const existing = await repo.findOne({ where: { title, classroomId: classroom.id } });
  if (existing) return existing;
  return repo.save(
    repo.create({
      title,
      description: 'Seeded assignment for local development.',
      startDate: new Date('2026-07-01T00:00:00Z'),
      endDate: new Date('2026-12-01T00:00:00Z'),
      classroomId: classroom.id,
      organizationId: classroom.organizationId,
      createdById: createdBy.id,
      status: AssignmentStatus.SCHEDULED,
    }),
  );
}

async function upsertAssignmentProblem(
  assignment: Assignment,
  problem: Problem,
  score: number,
  languages: Language[],
): Promise<AssignmentProblem> {
  const apRepo = dataSource.getRepository(AssignmentProblem);
  const templateRepo = dataSource.getRepository(ProblemTemplate);
  const libRepo = dataSource.getRepository(LibraryProblemTemplate);

  let ap = await apRepo.findOne({ where: { assignmentId: assignment.id, problemId: problem.id } });
  if (!ap) {
    ap = await apRepo.save(
      apRepo.create({
        assignmentId: assignment.id,
        problemId: problem.id,
        score,
        isImported: true,
      }),
    );
  }

  for (const language of languages) {
    const existingTemplate = await templateRepo.findOne({
      where: { assignmentProblemId: ap.id, language },
    });
    if (existingTemplate) continue;
    const lib = await libRepo.findOne({ where: { problemId: problem.id, language } });
    await templateRepo.save(
      templateRepo.create({
        assignmentProblemId: ap.id,
        language,
        driverCode: lib?.driverCode ?? '',
        starterCode: lib?.starterCode ?? '',
      }),
    );
  }

  return ap;
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
