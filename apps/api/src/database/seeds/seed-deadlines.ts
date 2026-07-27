import 'reflect-metadata';
import * as argon2 from 'argon2';
import { In } from 'typeorm';
import dataSource from '../data-source';
import { Role } from '../../common/enums/role.enum';
import { Language } from '../../common/enums/language.enum';
import { User } from '../../modules/users/entities/user.entity';
import { Classroom } from '../../modules/classrooms/entities/classroom.entity';
import { LEGACY_ORG_ID } from '../../modules/organizations/organizations.constants';
import { Problem } from '../../modules/problems/entities/problem.entity';
import { LibraryProblemTemplate } from '../../modules/problems/entities/library-problem-template.entity';
import { Assignment } from '../../modules/assignments/entities/assignment.entity';
import { AssignmentProblem } from '../../modules/assignments/entities/assignment-problem.entity';
import { ProblemTemplate } from '../../modules/assignments/entities/problem-template.entity';
import { AssignmentStatus } from '../../modules/assignments/enums/assignment-status.enum';

// Kept in step with run-seed.ts — see the note there on Clerk's breach check.
const PASSWORD = 'CodeStack#Dev2026!';
const DAY = 86_400_000;

/**
 * Demo-data seed for the dashboard "Upcoming deadlines" card + its countdown
 * chart. Creates 5 ACTIVE assignments in the seed classroom with deadlines
 * spread across the chart's urgency buckets (due now / a few days / this week /
 * later) so every colour shows.
 *
 * ACTIVE (not SCHEDULED) because `myActiveDeadlines` only returns ACTIVE rows,
 * and the deadlines are FUTURE-dated so the ~60s status sweep leaves them ACTIVE
 * (it completes a row only once now >= endDate).
 *
 * Idempotent AND self-refreshing: re-running updates each row's dates relative
 * to "now", so the demo stays colourful no matter when it's run. View the
 * dashboard as admin@codestack.dev (sees all) or professor@codestack.dev.
 */
async function main(): Promise<void> {
  await dataSource.initialize();
  console.log('Connected. Seeding deadline demo data...');

  const passwordHash = await argon2.hash(PASSWORD);
  const admin = await upsertUser('admin@codestack.dev', Role.ADMIN, 'Ada', 'Admin', passwordHash);
  const professor = await upsertUser(
    'professor@codestack.dev',
    Role.PROFESSOR,
    'Grace',
    'Hopper',
    passwordHash,
  );

  const classroom = await upsertClassroom(
    'SEED-CS101',
    'CodeStack Seed — Intro to Algorithms',
    professor,
    admin,
  );

  // A problem to attach so the assignments aren't empty (best-effort).
  const problem = await dataSource
    .getRepository(Problem)
    .createQueryBuilder('p')
    .orderBy('p.created_at', 'ASC')
    .getOne();

  const now = Date.now();
  const startDate = new Date(now - 7 * DAY);

  // Offsets (in days) requested by the user; the chart's urgency thresholds
  // (14 / 25 / 45) spread these across all four colours (red → amber → indigo → green).
  const specs: { title: string; inDays: number }[] = [
    { title: 'Arrays & Hashing — Problem Set 1', inDays: 11 }, // urgent (red)
    { title: 'Two Pointers Drill', inDays: 19 }, // soon (amber)
    { title: 'Binary Search Practice', inDays: 35 }, // upcoming (indigo)
    { title: 'Linked Lists Lab', inDays: 59 }, // later (green)
    { title: 'Dynamic Programming Warmup', inDays: 86 }, // later (green)
  ];

  for (const spec of specs) {
    const endDate = new Date(now + spec.inDays * DAY);
    const assignment = await upsertActiveAssignment(
      spec.title,
      classroom,
      professor,
      startDate,
      endDate,
    );
    if (problem) await attachProblem(assignment, problem).catch(() => undefined);
    console.log(`  • ${spec.title} — due in ${spec.inDays}d`);
  }

  // Retire any OTHER open assignment in the demo classroom (e.g. run-seed's
  // "Week 1 — Arrays Warmup") so the deadline chart shows exactly these five.
  const keep = specs.map((s) => s.title);
  const retired = await retireOtherAssignments(classroom, keep);
  if (retired.length) console.log(`  (retired ${retired.length}: ${retired.join(', ')})`);

  console.log('\nDeadline demo seed complete: 5 active assignments.');
  console.log('View the dashboard as admin@codestack.dev or professor@codestack.dev');
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
): Promise<Classroom> {
  const repo = dataSource.getRepository(Classroom);
  const existing = await repo.findOne({ where: { courseId } });
  if (existing) return existing;
  return repo.save(
    repo.create({
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
      totalUsers: 1,
    }),
  );
}

/** Create (or refresh the dates/status of) an ACTIVE assignment. */
async function upsertActiveAssignment(
  title: string,
  classroom: Classroom,
  createdBy: User,
  startDate: Date,
  endDate: Date,
): Promise<Assignment> {
  const repo = dataSource.getRepository(Assignment);
  const existing = await repo.findOne({ where: { title, classroomId: classroom.id } });
  if (existing) {
    existing.startDate = startDate;
    existing.endDate = endDate;
    existing.status = AssignmentStatus.ACTIVE;
    existing.publishedAt = existing.publishedAt ?? new Date();
    return repo.save(existing);
  }
  return repo.save(
    repo.create({
      title,
      description: 'Seeded assignment for the dashboard deadline demo.',
      startDate,
      endDate,
      classroomId: classroom.id,
      organizationId: classroom.organizationId,
      createdById: createdBy.id,
      status: AssignmentStatus.ACTIVE,
      publishedAt: new Date(),
    }),
  );
}

/** Best-effort: attach `problem` to `assignment` with copied library templates. */
async function attachProblem(assignment: Assignment, problem: Problem): Promise<void> {
  const apRepo = dataSource.getRepository(AssignmentProblem);
  const templateRepo = dataSource.getRepository(ProblemTemplate);
  const libRepo = dataSource.getRepository(LibraryProblemTemplate);

  let ap = await apRepo.findOne({
    where: { assignmentId: assignment.id, problemId: problem.id },
  });
  if (!ap) {
    ap = await apRepo.save(
      apRepo.create({ assignmentId: assignment.id, problemId: problem.id, score: 10, isImported: true }),
    );
  }

  const langs = [Language.PYTHON, Language.JAVASCRIPT];
  const libs = await libRepo.find({ where: { problemId: problem.id, language: In(langs) } });
  const byLang = new Map(libs.map((t) => [t.language, t]));
  for (const language of langs) {
    const exists = await templateRepo.findOne({
      where: { assignmentProblemId: ap.id, language },
    });
    if (exists) continue;
    const lib = byLang.get(language);
    await templateRepo.save(
      templateRepo.create({
        assignmentProblemId: ap.id,
        language,
        driverCode: lib?.driverCode ?? '',
        starterCode: lib?.starterCode ?? '',
      }),
    );
  }
}

/** Mark every OTHER open assignment in `classroom` as COMPLETED so the deadline
 *  demo is deterministic. Returns the titles retired. */
async function retireOtherAssignments(classroom: Classroom, keepTitles: string[]): Promise<string[]> {
  const repo = dataSource.getRepository(Assignment);
  const open = await repo.find({
    where: [
      { classroomId: classroom.id, status: AssignmentStatus.ACTIVE },
      { classroomId: classroom.id, status: AssignmentStatus.SCHEDULED },
    ],
  });
  const stray = open.filter((a) => !keepTitles.includes(a.title));
  for (const a of stray) {
    a.status = AssignmentStatus.COMPLETED;
    await repo.save(a);
  }
  return stray.map((a) => a.title);
}

main().catch((err) => {
  console.error('Deadline seed failed:', err);
  process.exit(1);
});
