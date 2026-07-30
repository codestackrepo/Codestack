import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
import { Role } from '../../common/enums/role.enum';
import { Assignment } from '../assignments/entities/assignment.entity';
import { Classroom } from '../classrooms/entities/classroom.entity';
import { OrgInvite } from '../invites/entities/org-invite.entity';
import { OrgInviteStatus } from '../invites/enums/org-invite.enums';
import { Problem } from '../problems/entities/problem.entity';
import { Submission } from '../submissions/entities/submission.entity';
import { User } from '../users/entities/user.entity';
import { OrgCountsDto } from './dto/platform-overview.dto';

/** Rows that belong to no tenant: org-less SuperAdmins and the global catalog. */
export interface PlatformOnlyCounts {
  superAdmins: number;
  globalProblems: number;
}

export interface PlatformCensus {
  /** Keyed by organization id. An org with no rows anywhere is simply absent. */
  byOrg: Record<string, OrgCountsDto>;
  platform: PlatformOnlyCounts;
}

type OrgGroupRow = { orgId: string | null; count: string };
type UserGroupRow = OrgGroupRow & { role: Role; isActive: boolean };

/** Countable per-org resources — the numeric fields folded from a group-by. */
type CountKey = 'pendingInvites' | 'classrooms' | 'problems' | 'assignments' | 'submissions';

/**
 * Cross-org counting for the platform console (#63).
 *
 * Every figure is a live `GROUP BY organization_id` — six queries total no matter
 * how many orgs exist (never one query per org), each able to use the per-table
 * `idx_*_organization` index added by the tenancy migrations. Deliberately no
 * denormalized counters: §5.4 rules them out because they drift, and counters stay
 * a deferred optimization unless profiling shows these reads are hot.
 *
 * This service does NOT apply `scopeToOrg` — it is reachable only from @Platform
 * routes, where cross-org reach is the whole point. Callers wanting a single
 * tenant pass `orgId`, which narrows the same aggregation via the same index.
 */
@Injectable()
export class PlatformMetricsService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(OrgInvite) private readonly invites: Repository<OrgInvite>,
    @InjectRepository(Classroom) private readonly classrooms: Repository<Classroom>,
    @InjectRepository(Problem) private readonly problems: Repository<Problem>,
    @InjectRepository(Assignment) private readonly assignments: Repository<Assignment>,
    @InjectRepository(Submission) private readonly submissions: Repository<Submission>,
  ) {}

  /** Live census for exactly one org (org detail). Absent from every group-by = zeros. */
  async countsForOrg(orgId: string): Promise<OrgCountsDto> {
    const census = await this.census(orgId);
    return census.byOrg[orgId] ?? OrgCountsDto.zero();
  }

  /**
   * Live census for every org. `orgId` narrows every aggregate to one tenant —
   * one code path, so an org's detail page can never disagree with its tile.
   */
  async census(orgId?: string): Promise<PlatformCensus> {
    const [userRows, inviteRows, classroomRows, problemRows, assignmentRows, submissionRows] =
      await Promise.all([
        this.userRows(orgId),
        this.groupByOrg(this.invites, 'i', orgId, (qb) =>
          // Only pending invites hold a seat: accepted ones are users already and
          // revoked ones released theirs (idx_org_invites_org_pending is partial).
          qb.andWhere('i.status = :pending', { pending: OrgInviteStatus.PENDING }),
        ),
        this.groupByOrg(this.classrooms, 'c', orgId),
        // A NULL organization_id here is exactly the global catalog — the DB CHECK
        // chk_problem_scope_org makes scope='global' <=> organization_id IS NULL.
        this.groupByOrg(this.problems, 'p', orgId),
        this.groupByOrg(this.assignments, 'a', orgId),
        this.groupByOrg(this.submissions, 's', orgId),
      ]);

    const byOrg: Record<string, OrgCountsDto> = {};
    const bucket = (id: string): OrgCountsDto => (byOrg[id] ??= OrgCountsDto.zero());

    let superAdmins = 0;
    for (const row of userRows) {
      const count = Number(row.count);
      if (row.orgId === null) {
        // Org-less rows are SuperAdmins (§5.3). A mis-provisioned org-less user of
        // any other role is not a tenant member either, so it stays out of byOrg
        // rather than being attributed to some org.
        if (row.role === Role.SUPERADMIN) superAdmins += count;
        continue;
      }
      const counts = bucket(row.orgId);
      counts.users += count;
      if (row.role === Role.ADMIN) counts.admins += count;
      else if (row.role === Role.PROFESSOR) counts.professors += count;
      else if (row.role === Role.STUDENT) counts.students += count;
      if (row.isActive) counts.activeUsers += count;
      else counts.inactiveUsers += count;
    }

    this.fold(inviteRows, bucket, 'pendingInvites');
    this.fold(classroomRows, bucket, 'classrooms');
    this.fold(assignmentRows, bucket, 'assignments');
    this.fold(submissionRows, bucket, 'submissions');
    // Problems are the one table with legitimately org-less rows (the catalog).
    const globalProblems = this.fold(problemRows, bucket, 'problems');

    return { byOrg, platform: { superAdmins, globalProblems } };
  }

  /**
   * Folds `organization_id, COUNT(*)` rows into their tenant bucket, returning the
   * org-less total. That total is 0 for every NOT NULL org column; only problems
   * (and users, handled above) can legitimately produce one.
   */
  private fold(rows: OrgGroupRow[], bucket: (id: string) => OrgCountsDto, key: CountKey): number {
    let orgless = 0;
    for (const row of rows) {
      const count = Number(row.count);
      if (row.orgId === null) orgless += count;
      else bucket(row.orgId)[key] += count;
    }
    return orgless;
  }

  /** `SELECT organization_id, COUNT(*) … GROUP BY organization_id`. */
  private groupByOrg<T extends ObjectLiteral>(
    repo: Repository<T>,
    alias: string,
    orgId: string | undefined,
    extend?: (qb: SelectQueryBuilder<T>) => unknown,
  ): Promise<OrgGroupRow[]> {
    const qb = repo
      .createQueryBuilder(alias)
      .select(`${alias}.organizationId`, 'orgId')
      .addSelect('COUNT(*)', 'count')
      .groupBy(`${alias}.organizationId`);
    if (orgId) qb.andWhere(`${alias}.organizationId = :__censusOrg`, { __censusOrg: orgId });
    extend?.(qb);
    return qb.getRawMany<OrgGroupRow>();
  }

  /** Role + active breakdown in one pass instead of a COUNT per (role, state). */
  private userRows(orgId?: string): Promise<UserGroupRow[]> {
    const qb = this.users
      .createQueryBuilder('u')
      .select('u.organizationId', 'orgId')
      .addSelect('u.role', 'role')
      .addSelect('u.isActive', 'isActive')
      .addSelect('COUNT(*)', 'count')
      .groupBy('u.organizationId')
      .addGroupBy('u.role')
      .addGroupBy('u.isActive');
    if (orgId) qb.andWhere('u.organizationId = :__censusOrg', { __censusOrg: orgId });
    return qb.getRawMany<UserGroupRow>();
  }
}
