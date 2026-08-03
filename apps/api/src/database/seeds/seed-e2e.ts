import 'reflect-metadata';
import * as argon2 from 'argon2';
import { IsNull } from 'typeorm';
import dataSource from '../data-source';
import { Language } from '../../common/enums/language.enum';
import { Role } from '../../common/enums/role.enum';
import { User } from '../../modules/users/entities/user.entity';
import { Organization } from '../../modules/organizations/entities/organization.entity';
import {
  OrganizationStatus,
  OrganizationType,
} from '../../modules/organizations/enums/organization.enums';
import { Classroom } from '../../modules/classrooms/entities/classroom.entity';
import { Batch } from '../../modules/classrooms/entities/batch.entity';
import { Problem } from '../../modules/problems/entities/problem.entity';
import { TestCase } from '../../modules/problems/entities/test-case.entity';
import { LibraryProblemTemplate } from '../../modules/problems/entities/library-problem-template.entity';
import { Assignment } from '../../modules/assignments/entities/assignment.entity';
import { AssignmentProblem } from '../../modules/assignments/entities/assignment-problem.entity';
import { AssignmentItem } from '../../modules/assignments/entities/assignment-item.entity';
import { AssignmentAttempt } from '../../modules/assignments/entities/assignment-attempt.entity';
import { ProblemTemplate } from '../../modules/assignments/entities/problem-template.entity';
import { McqOption } from '../../modules/assignments/entities/mcq-option.entity';
import { McqResponse } from '../../modules/assignments/entities/mcq-response.entity';
import { QuizResponse } from '../../modules/assignments/entities/quiz-response.entity';
import { AssignmentStatus } from '../../modules/assignments/enums/assignment-status.enum';
import { AssignmentKind } from '../../modules/assignments/enums/assignment-kind.enum';
import { AssignmentTargetType } from '../../modules/assignments/enums/assignment-target-type.enum';
import { AssignmentItemKind } from '../../modules/assignments/enums/assignment-item-kind.enum';
import { AssignmentItemGradingMode } from '../../modules/assignments/enums/assignment-item-grading-mode.enum';
import { AttemptStatus } from '../../modules/assignments/enums/attempt-status.enum';
import { Submission } from '../../modules/submissions/entities/submission.entity';
import { TestCaseResult } from '../../modules/submissions/entities/test-case-result.entity';
import { SubmissionContext } from '../../modules/submissions/enums/submission-context.enum';
import { SubmissionStatus } from '../../modules/submissions/enums/submission-status.enum';
import { ProblemScore } from '../../modules/grading/entities/problem-score.entity';
import { AssignmentScore } from '../../modules/grading/entities/assignment-score.entity';
import { GradingStatus } from '../../modules/grading/enums/grading-status.enum';
import { UserGamification } from '../../modules/gamification/entities/user-gamification.entity';
import { UserSolvedProblem } from '../../modules/gamification/entities/user-solved-problem.entity';
import { PointsLedger } from '../../modules/gamification/entities/points-ledger.entity';
import { DailyActivity } from '../../modules/gamification/entities/daily-activity.entity';
import { pointsForDifficulty } from '../../modules/gamification/gamification.util';
import { ProblemFeedback } from '../../modules/problems/feedback/entities/problem-feedback.entity';
import {
  ProblemFeedbackKind,
  ProblemFeedbackStatus,
} from '../../modules/problems/feedback/enums/problem-feedback.enums';
import { Topic } from '../../modules/topics/entities/topic.entity';
import { TopicComment } from '../../modules/topics/entities/topic-comment.entity';
import { Notification } from '../../modules/notifications/entities/notification.entity';
import { NotificationType } from '../../modules/notifications/enums/notification-type.enum';
import { OrgInvite } from '../../modules/invites/entities/org-invite.entity';
import {
  OrgInviteKind,
  OrgInviteSource,
  OrgInviteStatus,
} from '../../modules/invites/enums/org-invite.enums';
import { mintInviteToken } from '../../modules/invites/invite-token.util';
import { ProfessorRequest } from '../../modules/onboarding/entities/professor-request.entity';
import { RequestStatus } from '../../modules/onboarding/enums/onboarding.enums';
import { OrgQuota } from '../../modules/quotas/entities/org-quota.entity';
import { QuotaResource } from '../../modules/quotas/enums/quota-resource.enum';
import { OrgModuleGrant } from '../../modules/module-access/entities/org-module-grant.entity';
import { ModuleAccess } from '../../modules/module-access/entities/module-access.entity';
import { AppModuleKey } from '../../modules/module-access/enums/app-module-key.enum';
// ---- #118: verification, open platform, applications, problem authoring ----
import { UserOrigin } from '../../common/enums/user-origin.enum';
import { EmailVerificationToken } from '../../modules/auth/entities/email-verification-token.entity';
import {
  COMMUNITY_ORG_ID,
  LEGACY_ORG_ID,
} from '../../modules/organizations/organizations.constants';
import { OrganizationApplication } from '../../modules/organizations/entities/organization-application.entity';
import { OrgApplicationStatus } from '../../modules/organizations/enums/organization-application.enums';
import { ProfessorApplication } from '../../modules/onboarding/entities/professor-application.entity';
import { Tag } from '../../modules/problems/entities/tag.entity';
import {
  Difficulty,
  ProblemScope,
  ProblemSource,
  ProblemVisibility,
  TestCaseType,
} from '../../modules/problems/enums/problem.enums';
import { DriverSynthService } from '../../modules/code-execution/driver-synth/driver-synth.service';
import {
  encodeExpectedOutput,
  encodeStdin,
} from '../../modules/code-execution/driver-synth/io-codec';
import type { IoSpec } from '../../modules/code-execution/driver-synth/io-spec.types';

/**
 * Full-surface local E2E seed (`pnpm seed:e2e`).
 *
 * Builds a realistic multi-tenant snapshot so every read path in the product has
 * something non-trivial to render: three organizations plus the platform's own
 * community tenant, staff and students, classrooms with batches, assignments in
 * EVERY status and both kinds, coding + MCQ + quiz items, submissions with
 * per-testcase verdicts, grades with written feedback, practice-driven
 * gamification (streaks + heatmap), problem feedback and topic doubts in both
 * open and resolved states, notifications of every type, invites in every
 * lifecycle state, org-authored problems, and the #118 onboarding surfaces
 * (email verification, organization + professor applications).
 *
 * Idempotent: every step looks up its natural key first, so re-running adds
 * nothing and changes nothing. It only ever INSERTs — it never deletes, so it is
 * additive on top of `pnpm seed` / `seed:catalog` data rather than a reset.
 *
 * Deliberately NOT for any shared environment: every account shares one known
 * password (printed at the end), which is the whole point locally and
 * disqualifying anywhere else.
 */

const PASSWORD = 'CodeStack#E2E2026!';

// Fixed so re-runs, and anything a developer hardcodes against this data, stay
// stable across database resets.
//
// NOT 1111.../2222...: those two ids are owned by migrations — `LEGACY_ORG_ID` and
// `COMMUNITY_ORG_ID` (#118). Northwind used to sit on 2222..., which silently broke
// the whole open platform: `AddCommunityOrg` inserts ON CONFLICT DO NOTHING, so on a
// database seeded first the community row was skipped and `CommunityOrgService`
// refused to boot ("type is university, not community"). `assertNoReservedIds` below
// makes any future collision a loud failure at the top of the run instead.
const ORG_NORTHWIND = '66666666-6666-6666-6666-666666666666';
const ORG_SUMMIT = '33333333-3333-3333-3333-333333333333';
const ORG_RIDGEWAY = '44444444-4444-4444-4444-444444444444';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date();
const at = (days: number, hour = 9): Date => {
  const d = new Date(now.getTime() + days * DAY);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
};

/**
 * Deterministic LCG. Verdicts, scores and activity patterns must be identical on
 * every run, otherwise a re-seed against a fresh DB produces different numbers
 * and any expectation written against them rots.
 */
let rngState = 0x2f6e2b1;
const rand = (): number => {
  rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
  return rngState / 0x7fffffff;
};
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const between = (lo: number, hi: number): number => lo + Math.floor(rand() * (hi - lo + 1));

const toDateStr = (d: Date): string => d.toISOString().slice(0, 10);

/** Collected as we go and printed at the end. */
const credentials: Array<{ org: string; role: string; email: string; note: string }> = [];
const inviteLinks: string[] = [];
const verifyLinks: string[] = [];

interface StudentSpec {
  email: string;
  first: string;
  last: string;
  /** Drives how strong this student looks across submissions/grades. */
  skill: 'strong' | 'mid' | 'weak';
}

const NORTHWIND_STUDENTS: StudentSpec[] = [
  { email: 'aarav.sharma@northwind.edu', first: 'Aarav', last: 'Sharma', skill: 'strong' },
  { email: 'meera.iyer@northwind.edu', first: 'Meera', last: 'Iyer', skill: 'strong' },
  { email: 'rohan.gupta@northwind.edu', first: 'Rohan', last: 'Gupta', skill: 'mid' },
  { email: 'sara.khan@northwind.edu', first: 'Sara', last: 'Khan', skill: 'mid' },
  { email: 'diya.patel@northwind.edu', first: 'Diya', last: 'Patel', skill: 'mid' },
  { email: 'kabir.nair@northwind.edu', first: 'Kabir', last: 'Nair', skill: 'weak' },
  { email: 'ananya.rao@northwind.edu', first: 'Ananya', last: 'Rao', skill: 'strong' },
  { email: 'vivaan.mehta@northwind.edu', first: 'Vivaan', last: 'Mehta', skill: 'mid' },
  { email: 'ishaan.bose@northwind.edu', first: 'Ishaan', last: 'Bose', skill: 'weak' },
  { email: 'tara.menon@northwind.edu', first: 'Tara', last: 'Menon', skill: 'mid' },
  { email: 'zoya.ahmed@northwind.edu', first: 'Zoya', last: 'Ahmed', skill: 'strong' },
  { email: 'arjun.reddy@northwind.edu', first: 'Arjun', last: 'Reddy', skill: 'weak' },
];

const SUMMIT_STUDENTS: StudentSpec[] = [
  { email: 'liam.oconnor@summit.edu', first: 'Liam', last: "O'Connor", skill: 'strong' },
  { email: 'noah.wright@summit.edu', first: 'Noah', last: 'Wright', skill: 'mid' },
  { email: 'emma.silva@summit.edu', first: 'Emma', last: 'Silva', skill: 'mid' },
  { email: 'olivia.chen@summit.edu', first: 'Olivia', last: 'Chen', skill: 'weak' },
];

interface OrgProblemSpec {
  title: string;
  body: string;
  difficulty: Difficulty;
  /** SHARED = in the org catalog; PRIVATE = the author's draft. */
  visibility: ProblemVisibility;
  tags: string[];
  functionName: string;
  ioSpec: IoSpec;
  samples: Array<{ inputs: unknown[]; expected: unknown; explanation?: string }>;
  hidden: Array<{ inputs: unknown[]; expected: unknown }>;
  starter: { python: string; javascript: string };
}

/**
 * Problems a professor authored inside their own tenant (#118) — the org catalog,
 * which was empty before and made every scope filter and org-vs-global badge
 * untestable.
 *
 * Judge-ready the same way the global catalog is: `functionName` + `ioSpec` together
 * (half a spec is refused by `assertJudgeSpec`), stdin encoded by the real codec and
 * driver code synthesized by the real synthesizer, so these are actually solvable in
 * the editor rather than only browsable.
 */
const ORG_AUTHORED: OrgProblemSpec[] = [
  {
    title: 'Lab Attendance Streak',
    body:
      'Attendance for one lab section is recorded as a list of `1` (present) and `0` (absent), ' +
      'one entry per session in order.\n\nReturn the length of the longest run of consecutive ' +
      'sessions a student attended.\n\n## Examples\n\n### Example 1\n- Input: `days = [1, 1, 0, 1, 1, 1, 0]`\n' +
      '- Output: `3`\n- Explanation: The longest run is the three sessions in the middle.\n\n' +
      '### Example 2\n- Input: `days = [0, 0, 0]`\n- Output: `0`\n\n## Constraints\n' +
      '- `0 <= days.length <= 10^4`\n- Every entry is `0` or `1`.',
    difficulty: Difficulty.EASY,
    visibility: ProblemVisibility.SHARED,
    tags: ['arrays'],
    functionName: 'longestStreak',
    ioSpec: { params: [{ name: 'days', type: { array: 'int' } }], returns: 'int' },
    samples: [
      { inputs: [[1, 1, 0, 1, 1, 1, 0]], expected: 3, explanation: 'The middle run has length 3.' },
      { inputs: [[0, 0, 0]], expected: 0 },
    ],
    hidden: [
      { inputs: [[]], expected: 0 },
      { inputs: [[1]], expected: 1 },
      { inputs: [[1, 1, 1, 1]], expected: 4 },
      { inputs: [[0, 1, 0, 1, 0]], expected: 1 },
      { inputs: [[1, 0, 1, 1]], expected: 2 },
    ],
    starter: {
      python: 'def longestStreak(days):\n    # TODO: longest run of consecutive 1s\n    pass\n',
      javascript: 'function longestStreak(days) {\n  // TODO: longest run of consecutive 1s\n}\n',
    },
  },
  {
    title: 'Grade Curve Threshold',
    body:
      'Given the raw `scores` for a cohort and a number `topK`, return the score a student must ' +
      'reach to be in the top `topK` — that is, the `topK`-th highest score, counting duplicates ' +
      'separately.\n\nIf the cohort has fewer than `topK` students, return `-1`.\n\n## Examples\n\n' +
      '### Example 1\n- Input: `scores = [50, 80, 70, 90]`, `topK = 2`\n- Output: `80`\n' +
      '- Explanation: Sorted descending the scores are `[90, 80, 70, 50]`; the 2nd is `80`.\n\n' +
      '### Example 2\n- Input: `scores = [5]`, `topK = 2`\n- Output: `-1`\n\n## Constraints\n' +
      '- `0 <= scores.length <= 10^5`\n- `1 <= topK <= 10^5`\n- `0 <= scores[i] <= 100`',
    difficulty: Difficulty.MEDIUM,
    visibility: ProblemVisibility.PRIVATE,
    tags: ['sorting'],
    functionName: 'curveThreshold',
    ioSpec: {
      params: [
        { name: 'scores', type: { array: 'int' } },
        { name: 'topK', type: 'int' },
      ],
      returns: 'int',
    },
    samples: [{ inputs: [[50, 80, 70, 90], 2], expected: 80 }],
    hidden: [
      { inputs: [[5], 1], expected: 5 },
      { inputs: [[5], 2], expected: -1 },
      { inputs: [[10, 10, 9], 2], expected: 10 },
      { inputs: [[], 1], expected: -1 },
      { inputs: [[60, 61, 62, 63, 64], 5], expected: 60 },
    ],
    starter: {
      python:
        'def curveThreshold(scores, topK):\n    # TODO: the topK-th highest score\n    pass\n',
      javascript:
        'function curveThreshold(scores, topK) {\n  // TODO: the topK-th highest score\n}\n',
    },
  },
];

async function main(): Promise<void> {
  assertNoReservedIds();
  await dataSource.initialize();
  console.log('Connected. Building E2E dataset...\n');

  const passwordHash = await argon2.hash(PASSWORD);

  // ---------------------------------------------------------------- orgs
  const northwind = await upsertOrg(
    ORG_NORTHWIND,
    'Northwind Institute of Technology',
    'northwind',
    OrganizationType.UNIVERSITY,
    OrganizationStatus.ACTIVE,
  );
  const summit = await upsertOrg(
    ORG_SUMMIT,
    'Summit Polytechnic',
    'summit',
    OrganizationType.UNIVERSITY,
    OrganizationStatus.ACTIVE,
  );
  // Suspended on purpose: TenantContextGuard must refuse every member login.
  const ridgeway = await upsertOrg(
    ORG_RIDGEWAY,
    'Ridgeway College',
    'ridgeway',
    OrganizationType.ORGANIZATION,
    OrganizationStatus.SUSPENDED,
  );
  // Created by migration 1785610000000, never by a seed — every open-platform
  // account lives in it, so it must exist in every environment.
  const community = await requireCommunityOrg();
  console.log(
    `orgs:        ${[northwind, summit, ridgeway, community].map((o) => o.slug).join(', ')}`,
  );

  // --------------------------------------------------------------- users
  const nwAdmin = await upsertUser(
    'dean@northwind.edu',
    Role.ADMIN,
    'Nadia',
    'Deshpande',
    northwind.id,
    passwordHash,
    { note: 'org admin — members, invites, module matrix' },
  );
  const nwProfA = await upsertUser(
    'prof.rao@northwind.edu',
    Role.PROFESSOR,
    'Vikram',
    'Rao',
    northwind.id,
    passwordHash,
    { note: 'owns DSA classroom + most assignments' },
  );
  const nwProfB = await upsertUser(
    'prof.chen@northwind.edu',
    Role.PROFESSOR,
    'Lily',
    'Chen',
    northwind.id,
    passwordHash,
    { note: 'owns Advanced Problem Solving classroom' },
  );
  const nwStudents: User[] = [];
  for (const s of NORTHWIND_STUDENTS) {
    nwStudents.push(
      await upsertUser(s.email, Role.STUDENT, s.first, s.last, northwind.id, passwordHash, {
        note: `${s.skill} student`,
        quiet: true,
      }),
    );
  }
  // Two students double as graders in the DSA classroom (grader is not a role).
  const nwGraders = [nwStudents[0], nwStudents[1]];
  credentials.push({
    org: northwind.id,
    role: 'student (grader)',
    email: nwStudents[0].email,
    note: 'also a grader in NW-CS201',
  });
  credentials.push({
    org: northwind.id,
    role: 'student',
    email: nwStudents[2].email,
    note: 'plain student, mid performer',
  });

  // Inactive member: staff turned this account off (#105) — login must be refused.
  const nwSuspended = await upsertUser(
    'suspended.user@northwind.edu',
    Role.STUDENT,
    'Farhan',
    'Qureshi',
    northwind.id,
    passwordHash,
    { isActive: false, note: 'is_active=false — login must be refused' },
  );

  const suAdmin = await upsertUser(
    'registrar@summit.edu',
    Role.ADMIN,
    'Grace',
    'Whitfield',
    summit.id,
    passwordHash,
    { note: 'second tenant — proves org isolation' },
  );
  const suProf = await upsertUser(
    'prof.iyer@summit.edu',
    Role.PROFESSOR,
    'Anil',
    'Iyer',
    summit.id,
    passwordHash,
    { note: 'must NOT see any Northwind data' },
  );
  const suStudents: User[] = [];
  for (const s of SUMMIT_STUDENTS) {
    suStudents.push(
      await upsertUser(s.email, Role.STUDENT, s.first, s.last, summit.id, passwordHash, {
        quiet: true,
      }),
    );
  }
  credentials.push({
    org: summit.id,
    role: 'student',
    email: suStudents[0].email,
    note: 'isolation check',
  });

  await upsertUser('admin@ridgeway.edu', Role.ADMIN, 'Owen', 'Bradley', ridgeway.id, passwordHash, {
    note: 'SUSPENDED org — login must be blocked',
  });

  // Legacy holding state: self-registered before the community tenant existed, so
  // still org-less. TenantContextGuard confines these to the @AllowsUnassigned
  // routes, and the claim-invite flow is how they get out of it.
  const unassignedA = await upsertUser(
    'newjoiner1@gmail.com',
    Role.STUDENT,
    'Priya',
    'Kulkarni',
    null,
    passwordHash,
    { note: 'org-less holding state, claimable', origin: UserOrigin.OPEN },
  );
  const unassignedB = await upsertUser(
    'newjoiner2@gmail.com',
    Role.STUDENT,
    'Dev',
    'Malhotra',
    null,
    passwordHash,
    { note: 'org-less — has a pending professor request', origin: UserOrigin.OPEN },
  );

  // --------------------------------------------- open platform (#118)
  // The community tenant is a real org, so its members are ordinary users — what
  // makes them different is `origin = open` and the fact that nobody vouched for
  // the address, which is why verification exists at all.
  const openStudent = await upsertUser(
    'open.learner@gmail.com',
    Role.STUDENT,
    'Ritika',
    'Joshi',
    community.id,
    passwordHash,
    { note: 'self-signed-up, VERIFIED — can sign in', origin: UserOrigin.OPEN },
  );
  const openStudentB = await upsertUser(
    'open.solver@gmail.com',
    Role.STUDENT,
    'Marcus',
    'Bell',
    community.id,
    passwordHash,
    { note: 'self-signed-up, verified, practising', origin: UserOrigin.OPEN, quiet: true },
  );
  // The one account that must NOT be able to sign in: login answers 403
  // `email_unverified` AFTER the password check. A live token is printed below.
  const openUnverified = await upsertUser(
    'unverified.learner@gmail.com',
    Role.STUDENT,
    'Sana',
    'Fernandes',
    community.id,
    passwordHash,
    {
      note: 'email_verified_at IS NULL — login must 403 email_unverified',
      origin: UserOrigin.OPEN,
      verified: false,
    },
  );
  await issueVerificationToken(openUnverified);
  // An open PROFESSOR — only representable because the community tenant is a real
  // org (`chk_users_org_required` forbids an org-less professor).
  const openProfessor = await upsertUser(
    'open.tutor@gmail.com',
    Role.PROFESSOR,
    'Hannah',
    'Krishnan',
    community.id,
    passwordHash,
    { note: 'approved professor application — open platform', origin: UserOrigin.OPEN },
  );

  // Platform operator. Reviews organization + professor applications and owns the
  // entitlement/quota console; org-less by design (chk_users_org_required allows it).
  const superadmin = await upsertUser(
    'platform.admin@codestack.dev',
    Role.SUPERADMIN,
    'Priyanka',
    'Salvi',
    null,
    passwordHash,
    { note: 'platform console: applications, quotas, global catalog' },
  );
  console.log(
    `users:       ${nwStudents.length + suStudents.length + 8} across 3 orgs, ` +
      `4 in the community tenant, 2 org-less, 1 superadmin`,
  );

  // ------------------------------------------- quotas / grants / matrix
  await upsertQuota(northwind.id, QuotaResource.MAX_USERS, 50);
  await upsertQuota(northwind.id, QuotaResource.MAX_PROBLEMS, 200);
  await upsertQuota(northwind.id, QuotaResource.MAX_ASSIGNMENTS, 100);
  await upsertQuota(northwind.id, QuotaResource.MAX_PROFESSORS, 5);
  await upsertQuota(northwind.id, QuotaResource.MAX_STUDENTS, 40);
  // Summit sits 1 seat under its cap, so the next invite there hits the quota error.
  await upsertQuota(summit.id, QuotaResource.MAX_USERS, suStudents.length + 3);
  await upsertQuota(summit.id, QuotaResource.MAX_PROBLEMS, 0); // 0 = blocked, not unlimited
  // Per-role caps are an ADDITIONAL constraint, not a replacement (#118), and Summit
  // is arranged so the difference is observable: it holds 1 professor against a cap
  // of 1, so the next PROFESSOR invite is refused on the role cap while a STUDENT
  // invite still succeeds on the one remaining total seat.
  await upsertQuota(summit.id, QuotaResource.MAX_PROFESSORS, 1);
  await upsertQuota(summit.id, QuotaResource.MAX_STUDENTS, suStudents.length + 1);
  // The community tenant deliberately has NO quota rows — absent means unlimited,
  // and capping open signup would be capping the funnel.

  // Ridgeway did not buy the league: a hard false that even its own admin cannot lift.
  await upsertGrant(ridgeway.id, AppModuleKey.LEAGUE, false);
  await upsertGrant(summit.id, 'problems.author', true, { [Role.PROFESSOR]: true });

  for (const key of [AppModuleKey.PROBLEMS, AppModuleKey.PLAYGROUND, AppModuleKey.TOPICS]) {
    await upsertModuleAccess(northwind.id, key, Role.STUDENT, true);
  }
  await upsertModuleAccess(northwind.id, AppModuleKey.GRADING, Role.PROFESSOR, true);
  // Summit students cannot reach the playground — an org-layer override that wins
  // over the platform default.
  await upsertModuleAccess(summit.id, AppModuleKey.PLAYGROUND, Role.STUDENT, false);
  console.log('access:      quotas + grants + per-org module overrides');

  // ------------------------------------------------------------ problems
  // Reuse the judge-ready global catalog (that is what an org actually does),
  // and add a couple of org-owned problems so the org catalog is non-empty.
  const globalProblems = await dataSource
    .getRepository(Problem)
    .createQueryBuilder('p')
    .where('p.scope = :scope', { scope: 'global' })
    .andWhere('p.io_spec IS NOT NULL')
    .andWhere('p.function_name IS NOT NULL')
    .orderBy('p.difficulty', 'ASC')
    .addOrderBy('p.title', 'ASC')
    .getMany();

  if (globalProblems.length < 12) {
    throw new Error(
      `Only ${globalProblems.length} judge-ready global problems found. ` +
        `Run \`pnpm seed:catalog\` first — this seed builds assignments on top of that catalog.`,
    );
  }
  const easy = globalProblems.filter((p) => p.difficulty === 'easy');
  const medium = globalProblems.filter((p) => p.difficulty === 'medium');
  const hard = globalProblems.filter((p) => p.difficulty === 'hard');
  console.log(
    `problems:    reusing ${globalProblems.length} judge-ready global (${easy.length}E/${medium.length}M/${hard.length}H)`,
  );

  // Org-authored catalog (#118). Shared goes into the org catalog AND an assignment;
  // the draft stays private to its author, which is the pair the scope filter and the
  // visibility predicate are actually distinguishing.
  const nwShared = await upsertOrgProblem(ORG_AUTHORED[0], northwind.id, nwProfA);
  const nwDraft = await upsertOrgProblem(ORG_AUTHORED[1], northwind.id, nwProfB);
  console.log(
    `             + 2 org-authored (${nwShared.visibility} by Rao, ${nwDraft.visibility} by Chen)`,
  );

  // --------------------------------------------------------- classrooms
  const dsa = await upsertClassroom(
    northwind.id,
    'NW-CS201',
    'Data Structures & Algorithms',
    'Core second-year algorithms course. Weekly problem sets plus one timed midterm.',
    'Fall 2026',
    nwProfA,
    nwAdmin,
    nwStudents.slice(0, 10),
    nwGraders,
  );
  const advanced = await upsertClassroom(
    northwind.id,
    'NW-CS310',
    'Advanced Problem Solving',
    'Elective for contest preparation. Harder sets, optional participation.',
    'Fall 2026',
    nwProfB,
    nwAdmin,
    nwStudents.slice(6, 12),
    [],
  );
  const summitClass = await upsertClassroom(
    summit.id,
    'SU-CS101',
    'Introduction to Programming',
    'First-year introduction. Same course code shape as Northwind on purpose.',
    'Fall 2026',
    suProf,
    suAdmin,
    suStudents,
    [],
  );

  const batchA = await upsertBatch(dsa, 'Batch A — Morning', nwStudents.slice(0, 5));
  const batchB = await upsertBatch(dsa, 'Batch B — Evening', nwStudents.slice(5, 10));
  const contestSquad = await upsertBatch(advanced, 'Contest Squad', nwStudents.slice(6, 9));
  console.log(
    `classrooms:  ${dsa.courseId} (2 batches), ${advanced.courseId} (1 batch), ${summitClass.courseId}`,
  );

  // -------------------------------------------------------- assignments
  // One per status, plus a timed batch-targeted test.
  const wk1 = await upsertAssignment({
    title: 'Week 1 — Arrays & Two Pointers',
    description: 'Warm-up set. Graded and returned with written feedback.',
    classroom: dsa,
    createdBy: nwProfA,
    status: AssignmentStatus.GRADE_PUBLISHED,
    startDate: at(-38),
    endDate: at(-31),
    publishedAt: at(-30),
  });
  const wk2 = await upsertAssignment({
    title: 'Week 2 — Hashing & Counting',
    description: 'Closed for submissions; grading is still in progress.',
    classroom: dsa,
    createdBy: nwProfA,
    status: AssignmentStatus.COMPLETED,
    startDate: at(-24),
    endDate: at(-3),
  });
  const wk3 = await upsertAssignment({
    title: 'Week 3 — Sliding Window',
    description: 'Open now. Submissions are arriving.',
    classroom: dsa,
    createdBy: nwProfA,
    status: AssignmentStatus.ACTIVE,
    startDate: at(-5),
    endDate: at(6),
  });
  const wk4 = await upsertAssignment({
    title: 'Week 4 — Prefix Sums',
    description: 'Not open yet — students must not see this content.',
    classroom: dsa,
    createdBy: nwProfA,
    status: AssignmentStatus.SCHEDULED,
    startDate: at(7),
    endDate: at(18),
    // Batch-targeted AND still scheduled: targeting must not leak content that
    // the status alone already hides.
    targetType: AssignmentTargetType.BATCH,
    targetBatches: [batchB],
  });
  const wk5 = await upsertAssignment({
    title: 'Week 5 — Graphs (draft)',
    description: 'Still being authored. Invisible to students in any state.',
    classroom: dsa,
    createdBy: nwProfA,
    status: AssignmentStatus.DRAFT,
    startDate: at(20),
    endDate: at(31),
  });
  const midterm = await upsertAssignment({
    title: 'Midterm — Timed Test',
    description: '90 minutes from the moment you start. Batch A only.',
    classroom: dsa,
    createdBy: nwProfA,
    status: AssignmentStatus.ACTIVE,
    startDate: at(-2),
    endDate: at(4),
    kind: AssignmentKind.TEST,
    durationMinutes: 90,
    targetType: AssignmentTargetType.BATCH,
    targetBatches: [batchA],
  });
  const dpSet = await upsertAssignment({
    title: 'Dynamic Programming — Set 1',
    description: 'Graded, with per-problem feedback.',
    classroom: advanced,
    createdBy: nwProfB,
    status: AssignmentStatus.GRADE_PUBLISHED,
    startDate: at(-28),
    endDate: at(-14),
    publishedAt: at(-12),
  });
  const hardSet = await upsertAssignment({
    title: 'Hard Set — Contest Squad',
    description: 'Batch-targeted: only the Contest Squad may see this.',
    classroom: advanced,
    createdBy: nwProfB,
    status: AssignmentStatus.ACTIVE,
    startDate: at(-4),
    endDate: at(10),
    targetType: AssignmentTargetType.BATCH,
    targetBatches: [contestSquad],
  });
  const summitIntro = await upsertAssignment({
    title: 'Intro Assignment — Basics',
    description: 'Summit tenant data. Northwind staff must never see this.',
    classroom: summitClass,
    createdBy: suProf,
    status: AssignmentStatus.GRADE_PUBLISHED,
    startDate: at(-20),
    endDate: at(-8),
    publishedAt: at(-7),
  });
  console.log('assignments: 9 across every status, 1 timed test, 2 batch-targeted');

  // ------------------------------------------------- items per assignment
  // A coding item wraps an AssignmentProblem 1:1; mcq/quiz carry their own prompt.
  const wk1Coding = await addCodingItems(wk1, [easy[0], easy[1], medium[0]], [10, 10, 20]);
  const wk1Mcq = await addMcqItem(
    wk1,
    3,
    5,
    'Which traversal finds a pair summing to a target in a SORTED array in O(n)?',
    [
      { text: 'Two pointers from both ends', correct: true },
      { text: 'Nested loops over all pairs', correct: false },
      { text: 'Binary search for every element', correct: false },
      { text: 'Depth-first search', correct: false },
    ],
  );
  const wk1Quiz = await addQuizItem(
    wk1,
    4,
    10,
    'Explain why the two-pointer technique requires the input to be sorted. What breaks if it is not?',
  );

  const wk2Coding = await addCodingItems(wk2, [easy[2], easy[3], medium[1]], [10, 10, 20]);
  const wk2Quiz = await addQuizItem(
    wk2,
    3,
    10,
    'Compare a hash map and a sorted array for counting duplicates. Give the time and space cost of each.',
  );

  // The third item is the professor's OWN problem, so an org-authored problem is
  // exercised end to end: catalog -> assignment -> submissions -> grading.
  const wk3Coding = await addCodingItems(wk3, [easy[4], medium[2], nwShared], [15, 25, 10]);
  const wk3Mcq = await addMcqItem(
    wk3,
    3,
    5,
    'Select every statement that is true of a fixed-size sliding window.',
    [
      { text: 'The window advances one element at a time', correct: true },
      { text: 'Each element enters and leaves the window at most once', correct: true },
      { text: 'It requires the array to be sorted', correct: false },
      { text: 'It always needs O(n) extra space', correct: false },
    ],
    true,
  );

  await addCodingItems(wk4, [easy[5], medium[3]], [10, 20]);
  await addCodingItems(wk5, [medium[4]], [20]);
  const midtermCoding = await addCodingItems(midterm, [easy[6], medium[5], hard[0]], [15, 25, 40]);
  const dpCoding = await addCodingItems(dpSet, [medium[6], hard[1]], [30, 50]);
  const hardCoding = await addCodingItems(hardSet, [hard[2], hard[3]], [50, 50]);
  const summitCoding = await addCodingItems(summitIntro, [easy[7], easy[8]], [10, 10]);
  console.log('items:       coding + mcq + quiz across the graded assignments');

  // ------------------------------------------------------ student work
  // Fully graded, feedback published.
  await produceWork(wk1, wk1Coding, nwStudents.slice(0, 10), northwind.id, nwProfA, {
    grade: 'published',
    mcqItem: wk1Mcq,
    quizItem: wk1Quiz,
    quizGraded: true,
  });
  // Closed but grading still in flight — a realistic professor inbox.
  await produceWork(wk2, wk2Coding, nwStudents.slice(0, 10), northwind.id, nwProfA, {
    grade: 'partial',
    quizItem: wk2Quiz,
    quizGraded: false,
  });
  // Open assignment: submissions exist, nothing graded yet.
  await produceWork(wk3, wk3Coding, nwStudents.slice(0, 8), northwind.id, nwProfA, {
    grade: 'none',
    mcqItem: wk3Mcq,
  });
  await produceWork(dpSet, dpCoding, nwStudents.slice(6, 12), northwind.id, nwProfB, {
    grade: 'published',
  });
  await produceWork(hardSet, hardCoding, nwStudents.slice(6, 9), northwind.id, nwProfB, {
    grade: 'none',
  });
  await produceWork(summitIntro, summitCoding, suStudents, summit.id, suProf, {
    grade: 'published',
  });

  // Timed test — attempts in all three states, Batch A only.
  const midtermStudents = nwStudents.slice(0, 5);
  await produceWork(midterm, midtermCoding, midtermStudents, northwind.id, nwProfA, {
    grade: 'partial',
  });
  await upsertAttempt(midterm, midtermStudents[0], at(-1, 10), 90, AttemptStatus.SUBMITTED);
  await upsertAttempt(midterm, midtermStudents[1], at(-1, 11), 90, AttemptStatus.AUTO_SUBMITTED);
  await upsertAttempt(midterm, midtermStudents[2], at(0, 8), 90, AttemptStatus.IN_PROGRESS);
  console.log('work:        submissions + per-testcase results + grades + feedback');

  // -------------------------------------------------------- gamification
  // Practice-only by design, so this needs practice-context submissions. The two
  // community members are in here so the open platform's own dashboard and the
  // leaderboard are not empty for a self-signed-up user.
  const practising = [...nwStudents.slice(0, 10), ...suStudents, openStudent, openStudentB];
  for (const [i, student] of practising.entries()) {
    await buildPractice(student, globalProblems, i);
  }
  console.log('gamification: practice submissions, points, streaks, 120-day heatmap');

  // ---------------------------------------------------- problem feedback
  await upsertFeedback(easy[0], nwStudents[5], northwind.id, ProblemFeedbackKind.DOUBT, {
    body: 'I do not follow why the answer is not just the maximum element. Could you explain the second-largest case with duplicates?',
    status: ProblemFeedbackStatus.OPEN,
  });
  await upsertFeedback(medium[0], nwStudents[2], northwind.id, ProblemFeedbackKind.DOUBT, {
    body: 'My solution passes the samples but fails a hidden test. Is there an edge case with an empty window?',
    status: ProblemFeedbackStatus.RESOLVED,
    resolvedBy: nwProfA,
    resolutionNote: 'Your loop skipped the final window. Sample 3 now covers it explicitly.',
  });
  await upsertFeedback(easy[1], nwStudents[8], northwind.id, ProblemFeedbackKind.ISSUE, {
    body: 'The statement says 1 <= n but a sample uses n = 0. One of the two is wrong.',
    status: ProblemFeedbackStatus.OPEN,
  });
  await upsertFeedback(medium[1], nwStudents[0], northwind.id, ProblemFeedbackKind.SUGGESTION, {
    body: 'Adding one worked example with negative numbers would make the constraints much clearer.',
    status: ProblemFeedbackStatus.OPEN,
  });
  // Same global problem, different tenant — the org partition must keep these apart.
  await upsertFeedback(easy[0], suStudents[0], summit.id, ProblemFeedbackKind.DOUBT, {
    body: 'Summit student asking about the same global problem — Northwind staff must not see this.',
    status: ProblemFeedbackStatus.OPEN,
  });
  console.log('feedback:    5 problem-feedback rows (doubt/issue/suggestion, open + resolved)');

  // ---------------------------------------------------------- discussion
  const globalTopic = await upsertTopic(
    null,
    'Complexity Analysis — Common Pitfalls',
    'A platform-wide thread. Every tenant sees the topic; comments stay per-org.',
    null,
  );
  const nwTopic = await upsertTopic(
    northwind.id,
    'NW-CS201 — Midterm Preparation',
    'Northwind-only thread for midterm questions.',
    nwProfA.id,
  );
  await upsertComment(globalTopic, nwStudents[3], northwind.id, {
    body: 'Is amortized O(1) the same as average O(1)? I keep mixing them up.',
    isQuestion: true,
  });
  await upsertComment(globalTopic, suStudents[1], summit.id, {
    body: 'Summit-side comment on the same global topic — proves the per-org partition.',
    isQuestion: true,
  });
  const answered = await upsertComment(nwTopic, nwStudents[6], northwind.id, {
    body: 'Will the midterm cover graphs, or does it stop at sliding window?',
    isQuestion: true,
    resolvedBy: nwProfA,
  });
  await upsertComment(nwTopic, nwProfA, northwind.id, {
    body: 'It stops at sliding window. Graphs start in Week 5.',
    parentId: answered.id,
  });
  console.log('topics:      1 global + 1 org thread, questions open + resolved, 1 reply');

  // -------------------------------------------------------------- invites
  await upsertInvite({
    org: northwind,
    email: 'incoming.student@northwind.edu',
    role: Role.STUDENT,
    kind: OrgInviteKind.NEW_ACCOUNT,
    status: OrgInviteStatus.PENDING,
    invitedBy: nwAdmin,
    expiresAt: at(6),
    label: 'PENDING new_account (student)',
  });
  await upsertInvite({
    org: northwind,
    email: 'incoming.prof@northwind.edu',
    role: Role.PROFESSOR,
    kind: OrgInviteKind.NEW_ACCOUNT,
    status: OrgInviteStatus.PENDING,
    invitedBy: null, // superadmin-minted: staff onboarding is not an admin operation
    expiresAt: at(6),
    label: 'PENDING new_account (professor, superadmin-minted)',
  });
  await upsertInvite({
    org: northwind,
    email: unassignedA.email,
    role: Role.STUDENT,
    kind: OrgInviteKind.CLAIM,
    status: OrgInviteStatus.PENDING,
    invitedBy: nwAdmin,
    expiresAt: at(6),
    label: `PENDING claim -> existing unassigned ${unassignedA.email}`,
  });
  await upsertInvite({
    org: summit,
    email: 'bulk1@summit.edu',
    role: Role.STUDENT,
    kind: OrgInviteKind.NEW_ACCOUNT,
    status: OrgInviteStatus.PENDING,
    invitedBy: suAdmin,
    expiresAt: at(6),
    source: OrgInviteSource.BULK,
    batchId: '55555555-5555-5555-5555-555555555555',
    label: 'PENDING bulk roster invite (summit)',
  });
  await upsertInvite({
    org: northwind,
    email: 'accepted.already@northwind.edu',
    role: Role.STUDENT,
    kind: OrgInviteKind.NEW_ACCOUNT,
    status: OrgInviteStatus.ACCEPTED,
    invitedBy: nwAdmin,
    expiresAt: at(-1),
    acceptedAt: at(-8),
  });
  await upsertInvite({
    org: northwind,
    email: 'revoked.invite@northwind.edu',
    role: Role.STUDENT,
    kind: OrgInviteKind.NEW_ACCOUNT,
    status: OrgInviteStatus.REVOKED,
    invitedBy: nwAdmin,
    expiresAt: at(4),
    revokedAt: at(-2),
  });
  await upsertInvite({
    org: northwind,
    email: 'expired.invite@northwind.edu',
    role: Role.STUDENT,
    kind: OrgInviteKind.NEW_ACCOUNT,
    status: OrgInviteStatus.EXPIRED,
    invitedBy: nwAdmin,
    expiresAt: at(-9),
  });
  console.log('invites:     7 rows covering pending/accepted/revoked/expired + claim + bulk');

  // ------------------------------------------------- professor requests
  await upsertProfessorRequest(unassignedB, RequestStatus.PENDING, {
    message: 'I teach the evening algorithms section and need to author assignments.',
  });
  await upsertProfessorRequest(nwStudents[10], RequestStatus.APPROVED, {
    message: 'Requesting professor access to run the contest squad.',
    reviewedBy: nwAdmin,
    decisionReason: 'Confirmed with the department head.',
  });
  await upsertProfessorRequest(nwStudents[11], RequestStatus.REJECTED, {
    message: 'Please make me a professor.',
    reviewedBy: nwAdmin,
    decisionReason: 'No teaching assignment on record for this term.',
  });
  console.log('onboarding:  3 professor requests (pending/approved/rejected)');

  // ------------------------------------------------ applications (#118)
  // Three request-shaped tables, three genuinely different shapes: a professor
  // REQUEST promotes an existing member inside a tenant; an ORGANIZATION application
  // is pre-tenant and pre-account; a professor APPLICATION is pre-account and lands
  // in the community tenant.
  await upsertOrgApplication({
    organizationName: 'Lakeside Institute of Science',
    organizationType: OrganizationType.UNIVERSITY,
    contactName: 'Dr. Meenal Barve',
    contactEmail: 'dean.office@lakeside.edu',
    website: 'https://lakeside.edu',
    message:
      'We run three programming courses across two campuses and want to move our lab grading ' +
      'onto CodeStack from next term. Roughly 400 students and 12 teaching staff.',
    status: OrgApplicationStatus.PENDING,
  });
  await upsertOrgApplication({
    organizationName: summit.name,
    organizationType: OrganizationType.UNIVERSITY,
    contactName: 'Grace Whitfield',
    contactEmail: suAdmin.email,
    website: 'https://summit.edu',
    message: 'Introductory programming, one cohort to start.',
    status: OrgApplicationStatus.APPROVED,
    reviewedBy: superadmin,
    decisionReason: 'Approved: 10 professor seats, 200 student seats.',
    // The audit link back to the tenant the approval created.
    organizationId: summit.id,
  });
  await upsertOrgApplication({
    organizationName: 'Quickcert Bootcamp',
    organizationType: OrganizationType.ORGANIZATION,
    contactName: 'Ade Balogun',
    contactEmail: 'signups@quickcert.io',
    message: 'We would like accounts for our certification cohort.',
    status: OrgApplicationStatus.REJECTED,
    reviewedBy: superadmin,
    decisionReason:
      'The contact address is a shared inbox and the institution could not be verified. ' +
      'Re-apply from a domain address and we will look again.',
  });
  await upsertOrgApplication({
    organizationName: 'Harborview College',
    organizationType: OrganizationType.UNIVERSITY,
    contactName: 'Tom Whelan',
    contactEmail: 'it.admin@harborview.edu',
    message: 'Evaluating options for the next academic year.',
    // No self-serve route to this state in v1 — a superadmin sets it on request,
    // which is a consequence of the table being pre-account.
    status: OrgApplicationStatus.WITHDRAWN,
    reviewedBy: superadmin,
    decisionReason: 'Applicant withdrew: budget deferred to the following year.',
  });

  // The invite an approval mints: into the COMMUNITY tenant, source=application
  // (never `manual` — nobody in the target org chose to send it), already accepted
  // because `open.tutor@gmail.com` exists above.
  const openProfInvite = await upsertInvite({
    org: community,
    email: openProfessor.email,
    role: Role.PROFESSOR,
    kind: OrgInviteKind.NEW_ACCOUNT,
    status: OrgInviteStatus.ACCEPTED,
    invitedBy: null,
    expiresAt: at(-3),
    source: OrgInviteSource.APPLICATION,
    acceptedAt: at(-10),
  });
  await upsertProfessorApplication({
    email: openProfessor.email,
    firstName: openProfessor.firstName,
    lastName: openProfessor.lastName,
    institution: 'Independent — private tutoring',
    message: 'I coach five students for university entrance and want to set them problem sets.',
    status: OrgApplicationStatus.APPROVED,
    reviewedBy: superadmin,
    decisionReason: 'Verified through two former students. Invite sent.',
    inviteId: openProfInvite.id,
  });
  await upsertProfessorApplication({
    email: 'tutor.applicant@gmail.com',
    firstName: 'Nikhil',
    lastName: 'Verma',
    // Optional on purpose: an independent tutor has no institution, and requiring
    // one would exclude exactly the people the open platform exists for.
    message: 'Ex-industry, teaching a weekend algorithms group. Happy to provide references.',
    status: OrgApplicationStatus.PENDING,
  });
  await upsertProfessorApplication({
    email: 'notateacher@gmail.com',
    firstName: 'Casey',
    lastName: 'Doyle',
    institution: 'n/a',
    message: 'want prof account',
    status: OrgApplicationStatus.REJECTED,
    reviewedBy: superadmin,
    decisionReason: 'No teaching context given. A student account is the right fit here.',
  });
  console.log('applications: 4 organization (incl. withdrawn) + 3 professor, superadmin-reviewed');

  // -------------------------------------------------------- notifications
  await buildNotifications({
    students: nwStudents.slice(0, 10),
    staff: [nwProfA, nwAdmin],
    graders: nwGraders,
    published: [wk1, dpSet],
    active: [wk3, midterm],
    suspended: nwSuspended,
    unassigned: unassignedA,
    orgName: northwind.name,
    promoted: nwStudents[10],
    rejected: nwStudents[11],
  });
  const notifCount = await dataSource.getRepository(Notification).count();
  console.log(`notifications: every type, read + unread (${notifCount} rows total)`);

  report();
  await dataSource.destroy();
}

// ============================================================== helpers

async function upsertOrg(
  id: string,
  name: string,
  slug: string,
  type: OrganizationType,
  status: OrganizationStatus,
): Promise<Organization> {
  const repo = dataSource.getRepository(Organization);
  const existing = await repo.findOne({ where: { slug } });
  if (existing) return existing;
  return repo.save(
    repo.create({ id, name, slug, type, status, settings: { timezone: 'Asia/Kolkata' } }),
  );
}

/**
 * Fails BEFORE connecting if a fixed id here has since been claimed by a
 * migration. The community tenant is the reason this exists: it took an id this
 * seed already used, and the failure mode was silent in both directions.
 */
function assertNoReservedIds(): void {
  const reserved = new Map([
    [LEGACY_ORG_ID, 'LEGACY_ORG_ID'],
    [COMMUNITY_ORG_ID, 'COMMUNITY_ORG_ID'],
  ]);
  for (const [name, id] of Object.entries({ ORG_NORTHWIND, ORG_SUMMIT, ORG_RIDGEWAY })) {
    const owner = reserved.get(id);
    if (owner) {
      throw new Error(
        `${name} (${id}) is ${owner}, which is owned by a migration. Pick a different UUID — ` +
          `sharing it silently breaks the row the migration is responsible for.`,
      );
    }
  }
}

/**
 * The community tenant, which this seed reads and never writes: migration
 * 1785610000000 owns the row, so a missing or mistyped one is a broken database
 * rather than something to paper over here — `CommunityOrgService` would refuse to
 * boot on the same condition, just later and less clearly.
 */
async function requireCommunityOrg(): Promise<Organization> {
  const org = await dataSource.getRepository(Organization).findOne({
    where: { id: COMMUNITY_ORG_ID },
  });
  if (!org) {
    throw new Error(
      `The CodeStack Community organization (${COMMUNITY_ORG_ID}) is missing. Run ` +
        `\`pnpm migration:run\` — migration 1785610000000 creates it, and the API will not ` +
        `boot without it.`,
    );
  }
  if (org.type !== OrganizationType.COMMUNITY) {
    throw new Error(
      `Organization ${COMMUNITY_ORG_ID} exists but its type is "${org.type}", not "community". ` +
        `On a database seeded by an older seed-e2e that row is Northwind, and ` +
        `AddCommunityOrg (ON CONFLICT DO NOTHING) skipped its insert. See ` +
        `docs/E2E-TEST-DATA.md — "Upgrading a database seeded before #118".`,
    );
  }
  return org;
}

async function upsertUser(
  email: string,
  role: Role,
  firstName: string,
  lastName: string,
  organizationId: string | null,
  passwordHash: string,
  opts: {
    isActive?: boolean;
    note?: string;
    quiet?: boolean;
    origin?: UserOrigin;
    verified?: boolean;
  } = {},
): Promise<User> {
  const repo = dataSource.getRepository(User);
  let user = await repo.findOne({ where: { email } });
  if (!user) {
    user = await repo.save(
      repo.create({
        email,
        role,
        firstName,
        lastName,
        passwordHash,
        organizationId,
        isActive: opts.isActive ?? true,
        isStaff: role === Role.ADMIN || role === Role.PROFESSOR,
        timezone: 'Asia/Kolkata',
        lastLoginAt: opts.isActive === false ? null : at(-between(0, 5), 14),
        // Provenance, written once (#118). Everything this seed creates inside a
        // tenant was put there by staff, so CLOSED is the honest default; the
        // community-tenant accounts pass OPEN explicitly.
        origin: opts.origin ?? UserOrigin.CLOSED,
        // Without this, login answers 403 `email_unverified` and NOTHING in this
        // dataset is reachable. Migration 1785590000000 grandfathered the accounts
        // that predate verification; rows inserted afterwards get no such favour.
        emailVerifiedAt: opts.verified === false ? null : at(-between(6, 30), 9),
      }),
    );
  }
  if (!opts.quiet) {
    credentials.push({
      org: organizationId ?? '(none)',
      role,
      email,
      note: opts.note ?? '',
    });
  }
  return user;
}

/**
 * A live email-verification token for an unverified account, so the 403 gate can be
 * cleared from the UI without a working mail transport. Same shape the service
 * mints: sha256 in the column, raw value printed once and never stored.
 */
async function issueVerificationToken(user: User): Promise<void> {
  const repo = dataSource.getRepository(EmailVerificationToken);
  if (await repo.findOne({ where: { userId: user.id, usedAt: IsNull() } })) return;
  const { token, tokenHash } = mintInviteToken();
  await repo.save(
    repo.create({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(now.getTime() + DAY),
      usedAt: null,
    }),
  );
  verifyLinks.push(`${user.email}\n    /verify-email/${token}`);
}

async function upsertQuota(
  organizationId: string,
  resource: QuotaResource,
  limitValue: number | null,
): Promise<void> {
  const repo = dataSource.getRepository(OrgQuota);
  if (await repo.findOne({ where: { organizationId, resource } })) return;
  await repo.save(repo.create({ organizationId, resource, limitValue }));
}

async function upsertGrant(
  organizationId: string,
  featureKey: string,
  granted: boolean,
  roleDefaults: Record<string, boolean> | null = null,
): Promise<void> {
  const repo = dataSource.getRepository(OrgModuleGrant);
  if (await repo.findOne({ where: { organizationId, featureKey } })) return;
  await repo.save(repo.create({ organizationId, featureKey, granted, roleDefaults }));
}

async function upsertModuleAccess(
  orgId: string,
  moduleKey: string,
  role: Role,
  enabled: boolean,
): Promise<void> {
  const repo = dataSource.getRepository(ModuleAccess);
  if (await repo.findOne({ where: { orgId, moduleKey, role } })) return;
  await repo.save(repo.create({ orgId, moduleKey, role, enabled }));
}

/**
 * An org-scoped, judge-ready problem with its test cases and per-language templates
 * — what `POST /problems` produces for org staff, written directly.
 *
 * `scope = org` + a non-null `organization_id` is not a choice: `chk_problem_scope_org`
 * ties the two together, and the service derives both from the actor's role rather
 * than trusting the request, so a seed that set them independently would be able to
 * create a row the API never could.
 */
async function upsertOrgProblem(
  spec: OrgProblemSpec,
  organizationId: string,
  author: User,
): Promise<Problem> {
  const problemRepo = dataSource.getRepository(Problem);
  const testCaseRepo = dataSource.getRepository(TestCase);
  const templateRepo = dataSource.getRepository(LibraryProblemTemplate);
  const tagRepo = dataSource.getRepository(Tag);

  const existing = await problemRepo.findOne({ where: { title: spec.title, organizationId } });
  if (existing) return existing;

  const tags: Tag[] = [];
  for (const name of spec.tags) {
    tags.push(
      (await tagRepo.findOne({ where: { name } })) ??
        (await tagRepo.save(tagRepo.create({ name }))),
    );
  }

  const problem = await problemRepo.save(
    problemRepo.create({
      title: spec.title,
      body: spec.body,
      difficulty: spec.difficulty,
      source: ProblemSource.HUMAN,
      visibility: spec.visibility,
      scope: ProblemScope.ORG,
      organizationId,
      createdById: author.id,
      functionName: spec.functionName,
      ioSpec: spec.ioSpec,
      tags,
    }),
  );

  let order = 0;
  const rows: TestCase[] = [];
  const push = (
    tc: { inputs: unknown[]; expected: unknown; explanation?: string },
    type: TestCaseType,
  ): void => {
    rows.push(
      testCaseRepo.create({
        problemId: problem.id,
        inputData: encodeStdin(spec.ioSpec, tc.inputs),
        expectedOutput: encodeExpectedOutput(tc.expected),
        type,
        explanation: tc.explanation ?? '',
        isActive: true,
        orderIndex: order++,
      }),
    );
  };
  for (const tc of spec.samples) push(tc, TestCaseType.SAMPLE);
  for (const tc of spec.hidden) push(tc, TestCaseType.HIDDEN);
  await testCaseRepo.save(rows);

  const synth = new DriverSynthService(); // dependency-free, same as seed:catalog
  for (const [key, language] of [
    ['python', Language.PYTHON],
    ['javascript', Language.JAVASCRIPT],
  ] as const) {
    await templateRepo.save(
      templateRepo.create({
        problemId: problem.id,
        language,
        starterCode: spec.starter[key],
        driverCode: synth.synthesize(language, spec.functionName, spec.ioSpec),
        createdById: author.id,
      }),
    );
  }
  return problem;
}

async function upsertClassroom(
  organizationId: string,
  courseId: string,
  title: string,
  description: string,
  term: string,
  professor: User,
  createdBy: User,
  students: User[],
  graders: User[],
): Promise<Classroom> {
  const repo = dataSource.getRepository(Classroom);
  const existing = await repo.findOne({
    where: { organizationId, courseId },
    relations: { students: true, graders: true },
  });
  if (existing) return existing;
  return repo.save(
    repo.create({
      organizationId,
      courseId,
      title,
      description,
      term,
      startDate: at(-45),
      endDate: at(75),
      createdById: createdBy.id,
      professorId: professor.id,
      students,
      graders,
      totalUsers: students.length + graders.length + 1,
    }),
  );
}

async function upsertBatch(classroom: Classroom, name: string, students: User[]): Promise<Batch> {
  const repo = dataSource.getRepository(Batch);
  const existing = await repo.findOne({
    where: { classroomId: classroom.id, name },
    relations: { students: true },
  });
  if (existing) return existing;
  return repo.save(repo.create({ classroomId: classroom.id, name, students }));
}

async function upsertAssignment(spec: {
  title: string;
  description: string;
  classroom: Classroom;
  createdBy: User;
  status: AssignmentStatus;
  startDate: Date;
  endDate: Date;
  publishedAt?: Date;
  kind?: AssignmentKind;
  durationMinutes?: number;
  targetType?: AssignmentTargetType;
  targetBatches?: Batch[];
}): Promise<Assignment> {
  const repo = dataSource.getRepository(Assignment);
  const existing = await repo.findOne({
    where: { title: spec.title, classroomId: spec.classroom.id },
  });
  if (existing) return existing;
  return repo.save(
    repo.create({
      title: spec.title,
      description: spec.description,
      classroomId: spec.classroom.id,
      organizationId: spec.classroom.organizationId,
      createdById: spec.createdBy.id,
      status: spec.status,
      startDate: spec.startDate,
      endDate: spec.endDate,
      publishedAt: spec.publishedAt ?? null,
      kind: spec.kind ?? AssignmentKind.ASSIGNMENT,
      durationMinutes: spec.durationMinutes ?? null,
      targetType: spec.targetType ?? AssignmentTargetType.CLASSROOM,
      targetBatches: spec.targetBatches ?? [],
    }),
  );
}

/**
 * Creates the AssignmentProblem + its wrapping coding AssignmentItem + the
 * per-language templates. The AP ↔ item FK cycle is broken the way the service
 * does it: insert the AP, insert the item pointing at it, then backfill
 * `ap.assignment_item_id`.
 */
async function addCodingItems(
  assignment: Assignment,
  problems: Problem[],
  scores: number[],
): Promise<AssignmentProblem[]> {
  const apRepo = dataSource.getRepository(AssignmentProblem);
  const itemRepo = dataSource.getRepository(AssignmentItem);
  const tplRepo = dataSource.getRepository(ProblemTemplate);
  const libRepo = dataSource.getRepository(LibraryProblemTemplate);
  const out: AssignmentProblem[] = [];

  for (let i = 0; i < problems.length; i++) {
    const problem = problems[i];
    let ap = await apRepo.findOne({
      where: { assignmentId: assignment.id, problemId: problem.id },
    });
    if (!ap) {
      ap = await apRepo.save(
        apRepo.create({
          assignmentId: assignment.id,
          problemId: problem.id,
          score: scores[i],
          isImported: true,
        }),
      );
      const item = await itemRepo.save(
        itemRepo.create({
          assignmentId: assignment.id,
          kind: AssignmentItemKind.CODING,
          orderIndex: i,
          maxPoints: scores[i],
          prompt: '',
          gradingMode: AssignmentItemGradingMode.MANUAL,
          assignmentProblemId: ap.id,
        }),
      );
      ap.assignmentItemId = item.id;
      ap = await apRepo.save(ap);
    }

    const libs = await libRepo.find({ where: { problemId: problem.id } });
    for (const lib of libs) {
      const exists = await tplRepo.findOne({
        where: { assignmentProblemId: ap.id, language: lib.language },
      });
      if (exists) continue;
      await tplRepo.save(
        tplRepo.create({
          assignmentProblemId: ap.id,
          language: lib.language,
          starterCode: lib.starterCode,
          driverCode: lib.driverCode,
        }),
      );
    }
    out.push(ap);
  }
  return out;
}

async function addMcqItem(
  assignment: Assignment,
  orderIndex: number,
  maxPoints: number,
  prompt: string,
  options: Array<{ text: string; correct: boolean }>,
  allowMultiple = false,
): Promise<AssignmentItem> {
  const itemRepo = dataSource.getRepository(AssignmentItem);
  const optRepo = dataSource.getRepository(McqOption);
  // Keyed on the PROMPT, not the order index: inserting a coding item ahead of this
  // one shifts the index, and a lookup that misses would silently add a second copy
  // of the same question on the next run.
  const existing = await itemRepo.findOne({
    where: { assignmentId: assignment.id, prompt, kind: AssignmentItemKind.MCQ },
    relations: { options: true },
  });
  if (existing) {
    if (existing.orderIndex !== orderIndex) {
      existing.orderIndex = orderIndex;
      await itemRepo.save(existing);
    }
    return existing;
  }

  const item = await itemRepo.save(
    itemRepo.create({
      assignmentId: assignment.id,
      kind: AssignmentItemKind.MCQ,
      orderIndex,
      maxPoints,
      prompt,
      // MCQ is the only auto-scored kind.
      gradingMode: AssignmentItemGradingMode.AUTO,
      allowMultiple,
      assignmentProblemId: null,
    }),
  );
  for (let i = 0; i < options.length; i++) {
    await optRepo.save(
      optRepo.create({
        itemId: item.id,
        text: options[i].text,
        isCorrect: options[i].correct,
        orderIndex: i,
      }),
    );
  }
  return itemRepo.findOneOrFail({ where: { id: item.id }, relations: { options: true } });
}

async function addQuizItem(
  assignment: Assignment,
  orderIndex: number,
  maxPoints: number,
  prompt: string,
): Promise<AssignmentItem> {
  const repo = dataSource.getRepository(AssignmentItem);
  // Prompt-keyed for the same reason as the MCQ lookup above.
  const existing = await repo.findOne({
    where: { assignmentId: assignment.id, prompt, kind: AssignmentItemKind.QUIZ },
  });
  if (existing) {
    if (existing.orderIndex !== orderIndex) {
      existing.orderIndex = orderIndex;
      await repo.save(existing);
    }
    return existing;
  }
  return repo.save(
    repo.create({
      assignmentId: assignment.id,
      kind: AssignmentItemKind.QUIZ,
      orderIndex,
      maxPoints,
      prompt,
      gradingMode: AssignmentItemGradingMode.MANUAL,
      assignmentProblemId: null,
    }),
  );
}

/** Per-skill odds that a given submission lands on Accepted. */
const ACCEPT_RATE: Record<StudentSpec['skill'], number> = { strong: 0.85, mid: 0.55, weak: 0.3 };
const FAIL_VERDICTS = [
  SubmissionStatus.WRONG_ANSWER,
  SubmissionStatus.TIME_LIMIT_EXCEEDED,
  SubmissionStatus.RUNTIME_ERROR,
  SubmissionStatus.COMPILE_ERROR,
] as const;

const skillOf = (email: string): StudentSpec['skill'] =>
  [...NORTHWIND_STUDENTS, ...SUMMIT_STUDENTS].find((s) => s.email === email)?.skill ?? 'mid';

const SOLUTION_SNIPPET: Record<Language, string> = {
  [Language.PYTHON]: 'def solve(nums):\n    # seeded attempt\n    return max(nums)\n',
  [Language.JAVASCRIPT]:
    'function solve(nums) {\n  // seeded attempt\n  return Math.max(...nums);\n}\n',
  [Language.JAVA]:
    'class Solution {\n  int solve(int[] nums) {\n    // seeded attempt\n    return nums[0];\n  }\n}\n',
  [Language.CPP]:
    '#include <vector>\nint solve(std::vector<int>& nums) {\n  // seeded attempt\n  return nums[0];\n}\n',
};

/**
 * Generates submissions + per-testcase results for one assignment, then the
 * grading rows on top. `grade` controls how far down the pipeline each student
 * gets, which is what makes a professor's grading queue look real:
 *   'published' — every score graded, assignment_scores written with feedback
 *   'partial'   — roughly half graded, the rest sitting in `submitted`
 *   'none'      — submissions only; nothing graded
 */
async function produceWork(
  assignment: Assignment,
  aps: AssignmentProblem[],
  students: User[],
  organizationId: string,
  grader: User,
  opts: {
    grade: 'published' | 'partial' | 'none';
    mcqItem?: AssignmentItem;
    quizItem?: AssignmentItem;
    quizGraded?: boolean;
  },
): Promise<void> {
  const subRepo = dataSource.getRepository(Submission);
  const psRepo = dataSource.getRepository(ProblemScore);
  const asRepo = dataSource.getRepository(AssignmentScore);
  const mcqRespRepo = dataSource.getRepository(McqResponse);
  const quizRespRepo = dataSource.getRepository(QuizResponse);

  for (const [sIdx, student] of students.entries()) {
    const skill = skillOf(student.email);
    let earned = 0;
    let maxTotal = 0;

    for (const ap of aps) {
      const problem = await dataSource
        .getRepository(Problem)
        .findOneOrFail({ where: { id: ap.problemId } });
      const testCases = await dataSource
        .getRepository(TestCase)
        .find({ where: { problemId: ap.problemId }, order: { orderIndex: 'ASC' } });
      maxTotal += ap.score;

      const already = await subRepo.count({
        where: { userId: student.id, assignmentProblemId: ap.id },
      });
      let best: { sub: Submission; passed: number } | null = null;

      if (!already) {
        // A realistic trail: a couple of failures before the eventual pass.
        const attempts = between(1, 3);
        for (let a = 0; a < attempts; a++) {
          const isLast = a === attempts - 1;
          const accepted = isLast && rand() < ACCEPT_RATE[skill];
          const language = pick([Language.PYTHON, Language.JAVASCRIPT, Language.JAVA]);
          const total = testCases.length || 1;
          const passed = accepted ? total : between(0, Math.max(0, total - 1));
          const verdict = accepted ? SubmissionStatus.ACCEPTED : pick(FAIL_VERDICTS);

          const sub = await subRepo.save(
            subRepo.create({
              userId: student.id,
              organizationId,
              context: SubmissionContext.ASSIGNMENT,
              assignmentProblemId: ap.id,
              problemId: null,
              language,
              userCode: SOLUTION_SNIPPET[language],
              status: verdict,
              passedTestcaseCount: passed,
              totalTestcaseCount: total,
              runtimeMs: between(12, 480),
              memoryBytes: String(between(8, 64) * 1024 * 1024),
              failedTestcaseDetail: accepted
                ? null
                : {
                    input: testCases[Math.min(passed, testCases.length - 1)]?.inputData ?? '[]',
                    expected:
                      testCases[Math.min(passed, testCases.length - 1)]?.expectedOutput ?? '0',
                    output: 'null',
                    error:
                      verdict === SubmissionStatus.RUNTIME_ERROR ? 'IndexError: list index' : '',
                    stdout: '',
                  },
            }),
          );
          await writeResults(sub, testCases, passed, verdict);
          if (!best || passed > best.passed) best = { sub, passed };
        }
      }

      // Grading. 'partial' leaves roughly half the queue untouched.
      const shouldGrade =
        opts.grade === 'published' || (opts.grade === 'partial' && sIdx % 2 === 0);
      const existingPs = await psRepo.findOne({
        where: { assignmentProblemId: ap.id, userId: student.id },
      });
      if (!existingPs) {
        const ratio = best && best.sub.status === SubmissionStatus.ACCEPTED ? 1 : rand() * 0.6;
        const score = shouldGrade ? Math.round(ap.score * ratio * 10) / 10 : 0;
        earned += score;
        await psRepo.save(
          psRepo.create({
            assignmentProblemId: ap.id,
            userId: student.id,
            submissionId: best?.sub.id ?? null,
            score,
            submissionCount: await subRepo.count({
              where: { userId: student.id, assignmentProblemId: ap.id },
            }),
            feedback: shouldGrade ? codingFeedback(problem.title, ratio) : '',
            createdById: shouldGrade ? grader.id : null,
            gradingStatus: shouldGrade
              ? GradingStatus.GRADED
              : opts.grade === 'none'
                ? GradingStatus.SUBMITTED
                : GradingStatus.SUBMITTED,
          }),
        );
      } else {
        earned += existingPs.score;
      }
    }

    // MCQ — auto-scored on submit, so a response always carries its points.
    if (opts.mcqItem) {
      const options = opts.mcqItem.options ?? [];
      const correctIds = options.filter((o) => o.isCorrect).map((o) => o.id);
      const exists = await mcqRespRepo.findOne({
        where: { itemId: opts.mcqItem.id, userId: student.id },
      });
      if (!exists && options.length) {
        const rightAnswer = rand() < ACCEPT_RATE[skill];
        const selected = rightAnswer ? correctIds : [pick(options).id];
        const correct =
          selected.length === correctIds.length && selected.every((id) => correctIds.includes(id));
        await mcqRespRepo.save(
          mcqRespRepo.create({
            itemId: opts.mcqItem.id,
            userId: student.id,
            selectedOptionIds: selected,
            awardedPoints: correct ? opts.mcqItem.maxPoints : 0,
          }),
        );
        earned += correct ? opts.mcqItem.maxPoints : 0;
      }
      maxTotal += opts.mcqItem.maxPoints;
    }

    // Quiz — free text, manual. `awardedPoints` stays null until a professor grades.
    if (opts.quizItem) {
      const exists = await quizRespRepo.findOne({
        where: { itemId: opts.quizItem.id, userId: student.id },
      });
      if (!exists) {
        const graded = opts.quizGraded === true;
        const points = graded ? Math.round(opts.quizItem.maxPoints * (0.5 + rand() * 0.5)) : null;
        await quizRespRepo.save(
          quizRespRepo.create({
            itemId: opts.quizItem.id,
            userId: student.id,
            answerText: QUIZ_ANSWERS[sIdx % QUIZ_ANSWERS.length],
            awardedPoints: points,
            feedback: graded ? pick(QUIZ_FEEDBACK) : '',
            gradedById: graded ? grader.id : null,
          }),
        );
        earned += points ?? 0;
      }
      maxTotal += opts.quizItem.maxPoints;
    }

    // The assignment-level roll-up + the professor's written summary.
    if (opts.grade === 'published') {
      const exists = await asRepo.findOne({
        where: { assignmentId: assignment.id, userId: student.id },
      });
      if (!exists) {
        const pct = maxTotal ? earned / maxTotal : 0;
        await asRepo.save(
          asRepo.create({
            assignmentId: assignment.id,
            userId: student.id,
            finalScore: Math.round(earned * 10) / 10,
            feedback: summaryFeedback(pct),
            createdById: grader.id,
          }),
        );
      }
    }
  }
}

async function writeResults(
  submission: Submission,
  testCases: TestCase[],
  passed: number,
  verdict: SubmissionStatus,
): Promise<void> {
  const repo = dataSource.getRepository(TestCaseResult);
  for (const [i, tc] of testCases.entries()) {
    const ok = i < passed;
    await repo.save(
      repo.create({
        submissionId: submission.id,
        testCaseId: tc.id,
        ordinal: i,
        verdict: ok ? SubmissionStatus.ACCEPTED : verdict,
        runtimeMs: between(4, 120),
        memoryBytes: String(between(6, 40) * 1024 * 1024),
        exitCode: ok ? 0 : 1,
        stdout: ok ? tc.expectedOutput : '',
        stderr: ok || verdict !== SubmissionStatus.RUNTIME_ERROR ? '' : 'IndexError: list index',
        outputExtracted: ok ? tc.expectedOutput : 'null',
        truncated: false,
        isSample: tc.type === 'sample',
      }),
    );
  }
}

async function upsertAttempt(
  assignment: Assignment,
  student: User,
  startedAt: Date,
  durationMinutes: number,
  status: AttemptStatus,
): Promise<void> {
  const repo = dataSource.getRepository(AssignmentAttempt);
  if (await repo.findOne({ where: { assignmentId: assignment.id, userId: student.id } })) return;
  const deadlineAt = new Date(startedAt.getTime() + durationMinutes * 60 * 1000);
  await repo.save(
    repo.create({
      assignmentId: assignment.id,
      userId: student.id,
      startedAt,
      deadlineAt,
      submittedAt: status === AttemptStatus.IN_PROGRESS ? null : deadlineAt,
      status,
    }),
  );
}

/**
 * Practice work: standalone-problem submissions plus the gamification rows they
 * would have produced. Practice is the only context that feeds points/streaks.
 */
async function buildPractice(student: User, problems: Problem[], offset: number): Promise<void> {
  const subRepo = dataSource.getRepository(Submission);
  const solvedRepo = dataSource.getRepository(UserSolvedProblem);
  const ledgerRepo = dataSource.getRepository(PointsLedger);
  const gamRepo = dataSource.getRepository(UserGamification);
  const activityRepo = dataSource.getRepository(DailyActivity);
  const orgId = student.organizationId;
  if (!orgId) return;

  const skill = skillOf(student.email);
  // A real difficulty MIX, not the first N of a difficulty-ordered list — an
  // all-easy history makes the profile breakdown and the points total degenerate
  // (every strong student ends up on the same score, so the leaderboard is ties).
  const easyPool = problems.filter((p) => p.difficulty === 'easy');
  const mediumPool = problems.filter((p) => p.difficulty === 'medium');
  const hardPool = problems.filter((p) => p.difficulty === 'hard');
  const mix = { strong: [13, 9, 5], mid: [9, 5, 1], weak: [6, 1, 0] }[skill];
  // `offset` staggers WHICH problems each student solved, so two students at the
  // same skill tier get different totals and a distinguishable leaderboard.
  const take = <T>(pool: T[], n: number): T[] => {
    const start = offset % Math.max(1, pool.length - n);
    return pool.slice(start, start + n);
  };
  const chosen = [
    ...take(easyPool, mix[0] + (offset % 3)),
    ...take(mediumPool, mix[1]),
    ...take(hardPool, mix[2]),
  ];
  const solveCount = chosen.length;

  let totalPoints = 0;
  const byDifficulty: Record<string, number> = { easy: 0, medium: 0, hard: 0 };

  for (const [i, problem] of chosen.entries()) {
    const solvedAt = at(-(solveCount - i) * 3, 20);
    const existing = await subRepo.count({
      where: { userId: student.id, problemId: problem.id, context: SubmissionContext.PRACTICE },
    });
    if (!existing) {
      const tcs = await dataSource
        .getRepository(TestCase)
        .find({ where: { problemId: problem.id }, order: { orderIndex: 'ASC' } });
      const language = pick([Language.PYTHON, Language.JAVASCRIPT]);
      const sub = await subRepo.save(
        subRepo.create({
          userId: student.id,
          organizationId: orgId,
          context: SubmissionContext.PRACTICE,
          // Practice targets the problem directly — assignment_problem_id MUST be
          // null here or chk_submission_single_target rejects the row.
          assignmentProblemId: null as unknown as string,
          problemId: problem.id,
          language,
          userCode: SOLUTION_SNIPPET[language],
          status: SubmissionStatus.ACCEPTED,
          passedTestcaseCount: tcs.length,
          totalTestcaseCount: tcs.length,
          runtimeMs: between(10, 200),
          memoryBytes: String(between(8, 48) * 1024 * 1024),
          failedTestcaseDetail: null,
        }),
      );
      await writeResults(sub, tcs, tcs.length, SubmissionStatus.ACCEPTED);
    }

    if (!(await solvedRepo.findOne({ where: { userId: student.id, problemId: problem.id } }))) {
      await solvedRepo.save(
        solvedRepo.create({
          userId: student.id,
          problemId: problem.id,
          difficulty: problem.difficulty,
          firstSolvedAt: solvedAt,
        }),
      );
    }
    const points = pointsForDifficulty(problem.difficulty);
    if (
      !(await ledgerRepo.findOne({
        where: { userId: student.id, reason: 'first_solve', refKey: problem.id },
      }))
    ) {
      await ledgerRepo.save(
        ledgerRepo.create({
          userId: student.id,
          points,
          reason: 'first_solve',
          refKey: problem.id,
        }),
      );
    }
    totalPoints += points;
    byDifficulty[problem.difficulty] = (byDifficulty[problem.difficulty] ?? 0) + 1;
  }

  // 120-day heatmap with a live streak running up to today, so the dashboard
  // shows a non-zero current streak rather than a lapsed one.
  const streakLen = { strong: 21, mid: 9, weak: 3 }[skill];
  let longest = streakLen;
  for (let d = 119; d >= 0; d--) {
    const date = toDateStr(new Date(now.getTime() - d * DAY));
    const inStreak = d < streakLen;
    const active = inStreak || rand() < 0.45;
    if (!active) continue;
    if (await activityRepo.findOne({ where: { userId: student.id, activityDate: date } })) continue;
    const subs = between(1, 6);
    await activityRepo.save(
      activityRepo.create({
        userId: student.id,
        activityDate: date,
        submissionCount: subs,
        solvedCount: between(0, Math.min(subs, 3)),
      }),
    );
  }
  longest = Math.max(longest, streakLen + between(2, 9));

  const existingGam = await gamRepo.findOne({ where: { userId: student.id } });
  if (!existingGam) {
    await gamRepo.save(
      gamRepo.create({
        userId: student.id,
        organizationId: orgId,
        totalPoints,
        easySolved: byDifficulty.easy ?? 0,
        mediumSolved: byDifficulty.medium ?? 0,
        hardSolved: byDifficulty.hard ?? 0,
        currentStreak: streakLen,
        longestStreak: longest,
        lastActivityDate: toDateStr(now),
        timezone: student.timezone,
      }),
    );
  }
}

async function upsertFeedback(
  problem: Problem,
  author: User,
  organizationId: string,
  kind: ProblemFeedbackKind,
  opts: {
    body: string;
    status: ProblemFeedbackStatus;
    resolvedBy?: User;
    resolutionNote?: string;
  },
): Promise<void> {
  const repo = dataSource.getRepository(ProblemFeedback);
  if (await repo.findOne({ where: { problemId: problem.id, authorId: author.id, kind } })) return;
  const resolved = opts.status === ProblemFeedbackStatus.RESOLVED;
  await repo.save(
    repo.create({
      problemId: problem.id,
      authorId: author.id,
      // The AUTHOR's org, never the problem's — a global problem has none.
      organizationId,
      kind,
      body: opts.body,
      status: opts.status,
      resolvedById: resolved ? (opts.resolvedBy?.id ?? null) : null,
      resolvedAt: resolved ? at(-2, 16) : null,
      resolutionNote: resolved ? (opts.resolutionNote ?? null) : null,
    }),
  );
}

async function upsertTopic(
  organizationId: string | null,
  title: string,
  description: string,
  createdById: string | null,
): Promise<Topic> {
  const repo = dataSource.getRepository(Topic);
  const existing = await repo.findOne({ where: { title } });
  if (existing) return existing;
  return repo.save(
    repo.create({ organizationId, title, description, createdById, isLocked: false }),
  );
}

async function upsertComment(
  topic: Topic,
  author: User,
  organizationId: string,
  opts: { body: string; isQuestion?: boolean; parentId?: string; resolvedBy?: User },
): Promise<TopicComment> {
  const repo = dataSource.getRepository(TopicComment);
  const existing = await repo.findOne({
    where: { topicId: topic.id, authorId: author.id, body: opts.body },
  });
  if (existing) return existing;
  const isQuestion = opts.isQuestion === true;
  return repo.save(
    repo.create({
      topicId: topic.id,
      authorId: author.id,
      organizationId,
      body: opts.body,
      parentId: opts.parentId ?? null,
      isQuestion,
      // chk_topic_comment_resolved: only a question may carry resolution.
      resolvedAt: isQuestion && opts.resolvedBy ? at(-1, 12) : null,
      resolvedById: isQuestion && opts.resolvedBy ? opts.resolvedBy.id : null,
    }),
  );
}

async function upsertInvite(spec: {
  org: Organization;
  email: string;
  role: Role;
  kind: OrgInviteKind;
  status: OrgInviteStatus;
  invitedBy: User | null;
  expiresAt: Date;
  source?: OrgInviteSource;
  batchId?: string;
  acceptedAt?: Date;
  revokedAt?: Date;
  label?: string;
}): Promise<OrgInvite> {
  const repo = dataSource.getRepository(OrgInvite);
  const existing = await repo.findOne({
    where: { organizationId: spec.org.id, email: spec.email },
  });
  if (existing) return existing;

  // The raw token exists only here and in the printed link — the row keeps the hash.
  const { token, tokenHash } = mintInviteToken();
  const saved = await repo.save(
    repo.create({
      organizationId: spec.org.id,
      tokenHash,
      email: spec.email,
      role: spec.role,
      status: spec.status,
      kind: spec.kind,
      source: spec.source ?? OrgInviteSource.MANUAL,
      expiresAt: spec.expiresAt,
      acceptedAt: spec.acceptedAt ?? null,
      revokedAt: spec.revokedAt ?? null,
      lastSentAt: at(-1, 10),
      sendCount: 1,
      firstName: null,
      lastName: null,
      invitedById: spec.invitedBy?.id ?? null,
      batchId: spec.batchId ?? null,
    }),
  );
  if (spec.status === OrgInviteStatus.PENDING && spec.label) {
    inviteLinks.push(`${spec.label}\n    ${spec.email}\n    /invite/${token}`);
  }
  return saved;
}

/**
 * An institution asking for a tenant (#118). Pre-tenant AND pre-account: at
 * submission neither the organization nor the contact's user row exists, which is
 * why `organization_id` is the audit link an approval fills in rather than an FK the
 * row depends on.
 */
async function upsertOrgApplication(spec: {
  organizationName: string;
  organizationType: OrganizationType;
  contactName: string;
  contactEmail: string;
  website?: string;
  message: string;
  status: OrgApplicationStatus;
  reviewedBy?: User;
  decisionReason?: string;
  organizationId?: string;
}): Promise<void> {
  const repo = dataSource.getRepository(OrganizationApplication);
  if (await repo.findOne({ where: { contactEmail: spec.contactEmail } })) return;
  const decided = spec.status !== OrgApplicationStatus.PENDING;
  await repo.save(
    repo.create({
      organizationName: spec.organizationName,
      organizationType: spec.organizationType,
      website: spec.website ?? null,
      contactName: spec.contactName,
      contactEmail: spec.contactEmail,
      message: spec.message,
      status: spec.status,
      reviewedById: decided ? (spec.reviewedBy?.id ?? null) : null,
      reviewedAt: decided ? at(-between(3, 20), 11) : null,
      decisionReason: decided ? (spec.decisionReason ?? '') : '',
      organizationId: spec.organizationId ?? null,
    }),
  );
}

/**
 * A stranger asking to TEACH on the open platform (#118) — reviewed by the platform
 * superadmin, not an org admin, because there is no org yet and no account either.
 * Distinct from `ProfessorRequest`, which promotes someone already inside a tenant.
 */
async function upsertProfessorApplication(spec: {
  email: string;
  firstName: string;
  lastName: string;
  institution?: string;
  message: string;
  status: OrgApplicationStatus;
  reviewedBy?: User;
  decisionReason?: string;
  inviteId?: string;
}): Promise<void> {
  const repo = dataSource.getRepository(ProfessorApplication);
  if (await repo.findOne({ where: { email: spec.email } })) return;
  const decided = spec.status !== OrgApplicationStatus.PENDING;
  await repo.save(
    repo.create({
      email: spec.email,
      firstName: spec.firstName,
      lastName: spec.lastName,
      institution: spec.institution ?? null,
      message: spec.message,
      status: spec.status,
      reviewedById: decided ? (spec.reviewedBy?.id ?? null) : null,
      reviewedAt: decided ? at(-between(2, 15), 15) : null,
      decisionReason: decided ? (spec.decisionReason ?? '') : '',
      inviteId: spec.inviteId ?? null,
    }),
  );
}

async function upsertProfessorRequest(
  user: User,
  status: RequestStatus,
  opts: { message: string; reviewedBy?: User; decisionReason?: string },
): Promise<void> {
  const repo = dataSource.getRepository(ProfessorRequest);
  if (await repo.findOne({ where: { userId: user.id } })) return;
  const decided = status !== RequestStatus.PENDING;
  await repo.save(
    repo.create({
      userId: user.id,
      status,
      message: opts.message,
      reviewedById: decided ? (opts.reviewedBy?.id ?? null) : null,
      reviewedAt: decided ? at(-3, 11) : null,
      decisionReason: decided ? (opts.decisionReason ?? '') : '',
    }),
  );
}

/**
 * One row per (recipient, type, entity) — the unique index that makes fan-out
 * idempotent also means each pair here needs a distinct entity id.
 */
async function buildNotifications(spec: {
  students: User[];
  staff: User[];
  graders: User[];
  published: Assignment[];
  active: Assignment[];
  suspended: User;
  unassigned: User;
  orgName: string;
  promoted: User;
  rejected: User;
}): Promise<void> {
  const repo = dataSource.getRepository(Notification);

  const add = async (
    user: User,
    type: NotificationType,
    title: string,
    message: string,
    entityType: string,
    entityId: string,
    link: string,
    read: boolean,
  ): Promise<void> => {
    if (await repo.findOne({ where: { userId: user.id, type, entityId } })) return;
    await repo.save(
      repo.create({
        userId: user.id,
        type,
        title,
        message,
        entityType,
        entityId,
        link,
        readAt: read ? at(-1, 15) : null,
      }),
    );
  };

  for (const [i, student] of spec.students.entries()) {
    for (const a of spec.active) {
      await add(
        student,
        NotificationType.NEW_ASSIGNMENT,
        `New assignment: ${a.title}`,
        `${a.title} is now open. Due ${a.endDate.toDateString()}.`,
        'assignment',
        a.id,
        '/home/assignments',
        i % 3 === 0,
      );
    }
    for (const a of spec.published) {
      await add(
        student,
        NotificationType.GRADES_PUBLISHED,
        `Grades published: ${a.title}`,
        `Your score and feedback for ${a.title} are available.`,
        'assignment',
        a.id,
        '/home/assignments',
        i % 2 === 0,
      );
      await add(
        student,
        NotificationType.FEEDBACK_RECEIVED,
        `Feedback on ${a.title}`,
        'Your professor left written feedback on your submission.',
        'assignment',
        a.id,
        '/home/assignments',
        false,
      );
    }
    await add(
      student,
      NotificationType.ASSIGNMENT_UPDATED,
      `New problem in ${spec.active[0].title}`,
      'A problem was added to an assignment you can already see.',
      'assignment_problem',
      spec.active[0].id,
      '/home/assignments',
      i % 4 === 0,
    );
  }

  // Staff + graders see submission traffic and student doubts.
  for (const person of [...spec.staff, ...spec.graders]) {
    for (const a of spec.active) {
      await add(
        person,
        NotificationType.SUBMISSION_RECEIVED,
        `New submission in ${a.title}`,
        'A student submitted work that is waiting to be graded.',
        'assignment',
        a.id,
        '/home/grading',
        false,
      );
    }
    await add(
      person,
      NotificationType.PROBLEM_FEEDBACK_RECEIVED,
      'A student raised a doubt',
      'A doubt was raised on a problem in your organization.',
      'problem_feedback',
      spec.published[0].id,
      '/home/problems',
      false,
    );
    await add(
      person,
      NotificationType.TOPIC_DOUBT_RAISED,
      'New question on a topic',
      'A student asked a question in a discussion thread.',
      'topic_comment',
      spec.active[0].id,
      '/home/topics',
      false,
    );
  }

  // Per-user lifecycle events.
  await add(
    spec.suspended,
    NotificationType.ACCESS_REVOKED,
    'Your access was turned off',
    'Contact your administrator for details.',
    'user',
    spec.suspended.id,
    '/home/profile',
    false,
  );
  await add(
    spec.students[0],
    NotificationType.ACCESS_RESTORED,
    'Your access was restored',
    'You can sign in and continue where you left off.',
    'user',
    spec.students[0].id,
    '/home/profile',
    true,
  );
  await add(
    spec.unassigned,
    NotificationType.ORGANIZATION_ASSIGNED,
    `You've joined ${spec.orgName}`,
    'You now have access to your classrooms and assignments.',
    'organization',
    spec.unassigned.id,
    '/home/dashboard',
    false,
  );
  await add(
    spec.promoted,
    NotificationType.PROFESSOR_REQUEST_APPROVED,
    'Your professor access was approved',
    'You can now create classrooms and author assignments.',
    'professor_request',
    spec.promoted.id,
    '/home/profile',
    false,
  );
  await add(
    spec.rejected,
    NotificationType.PROFESSOR_REQUEST_REJECTED,
    'Your professor access request was declined',
    'No teaching assignment on record for this term.',
    'professor_request',
    spec.rejected.id,
    '/home/profile',
    false,
  );
  await add(
    spec.students[2],
    NotificationType.PROBLEM_FEEDBACK_RESOLVED,
    'Your doubt was resolved',
    'A professor replied to the doubt you raised.',
    'problem_feedback',
    spec.students[2].id,
    '/home/problems',
    false,
  );
  await add(
    spec.students[6],
    NotificationType.TOPIC_DOUBT_RESOLVED,
    'Your question was marked resolved',
    'A professor answered your question in a discussion thread.',
    'topic_comment',
    spec.students[6].id,
    '/home/topics',
    false,
  );
}

// ------------------------------------------------------- feedback prose

const QUIZ_ANSWERS = [
  'Sorting gives the ordering invariant the two pointers rely on: everything left of `i` is smaller and everything right of `j` is larger, so moving a pointer can only move the sum in one known direction. Without sorting that guarantee disappears and skipping a candidate can skip the answer.',
  'The pointers assume monotonicity. On unsorted input, decrementing the right pointer might discard the only valid partner, so the scan can miss a pair that exists.',
  'You need sorted input because the decision to move left or right is made from the comparison of the current sum against the target, which is only meaningful when the values are ordered.',
  'If the array is not sorted the algorithm still runs but is no longer correct — it can terminate without examining the matching pair.',
];

const QUIZ_FEEDBACK = [
  'Correct, and you named the invariant explicitly — that is exactly the reasoning I wanted.',
  'Right conclusion. Tighten it by stating what happens to the discarded candidate.',
  'Good, but you described the mechanism without saying why monotonicity matters.',
  'Partially correct: the runtime claim is right, the correctness argument is not.',
];

function codingFeedback(title: string, ratio: number): string {
  if (ratio >= 0.95) {
    return `Clean solution to "${title}" — optimal complexity and the edge cases are handled. Nothing to change.`;
  }
  if (ratio >= 0.6) {
    return `Correct approach on "${title}" and it passes, but the inner loop makes this O(n^2) where O(n) is reachable. Try a single pass with a running count.`;
  }
  if (ratio > 0) {
    return `"${title}" fails on the boundary cases — empty input and all-equal values both break your loop. The core idea is right; fix the guards.`;
  }
  return `No passing submission for "${title}". Start from the sample case and work outward; come to office hours if you are stuck.`;
}

function summaryFeedback(pct: number): string {
  if (pct >= 0.9) {
    return 'Excellent set overall. Strong grasp of the invariants and your write-ups explain the reasoning, not just the code. Push into the harder optional problems next.';
  }
  if (pct >= 0.7) {
    return 'Solid work. Coding solutions are mostly correct; the written answers are where you lost points — be explicit about why an approach is correct, not only what it does.';
  }
  if (pct >= 0.4) {
    return 'Passing, but the pattern here is edge cases rather than concepts. You reach a working idea and stop before testing the boundaries. Please attend the review session.';
  }
  return 'This set did not go well. The gap looks conceptual rather than careless — let us meet in office hours before the next assignment builds on it.';
}

function report(): void {
  const line = '='.repeat(78);
  console.log(`\n${line}\nE2E DATASET READY\n${line}`);
  console.log(`\nPassword for EVERY seeded account below:\n    ${PASSWORD}\n`);

  const byOrg = new Map<string, typeof credentials>();
  for (const c of credentials) {
    const key =
      c.org === ORG_NORTHWIND
        ? 'Northwind Institute of Technology (active)'
        : c.org === ORG_SUMMIT
          ? 'Summit Polytechnic (active)'
          : c.org === ORG_RIDGEWAY
            ? 'Ridgeway College (SUSPENDED)'
            : c.org === COMMUNITY_ORG_ID
              ? 'CodeStack Community (open platform)'
              : 'No organization (superadmin / holding state)';
    if (!byOrg.has(key)) byOrg.set(key, []);
    byOrg.get(key)!.push(c);
  }
  for (const [org, rows] of byOrg) {
    console.log(`  ${org}`);
    for (const r of rows) {
      console.log(`    ${r.role.padEnd(16)} ${r.email.padEnd(34)} ${r.note}`);
    }
    console.log('');
  }

  if (inviteLinks.length) {
    console.log('Live invite links (raw tokens — printed only on the run that mints them):');
    for (const l of inviteLinks) console.log(`  - ${l}`);
    console.log('');
  }
  if (verifyLinks.length) {
    console.log('Live email-verification links (clears the 403 email_unverified gate):');
    for (const l of verifyLinks) console.log(`  - ${l}`);
    console.log('');
  }
  console.log(`${line}`);
}

main().catch((err) => {
  console.error('seed-e2e failed:', err);
  process.exit(1);
});
