import { ApiProperty } from '@nestjs/swagger';
import { Organization } from '../../organizations/entities/organization.entity';
import { OrganizationStatus, OrganizationType } from '../../organizations/enums/organization.enums';

/**
 * Per-org census (#63). One shape serves both the overview tiles and the org
 * detail endpoint, so the same org can never report different numbers on the two
 * screens. SuperAdmins are org-less and therefore never counted here.
 */
export class OrgCountsDto {
  @ApiProperty({ description: 'Org members of any role/state.' })
  users!: number;
  @ApiProperty() admins!: number;
  @ApiProperty() professors!: number;
  @ApiProperty() students!: number;
  @ApiProperty() activeUsers!: number;
  @ApiProperty() inactiveUsers!: number;
  @ApiProperty({
    description: 'Pending invites — seats reserved but not yet accepted.',
  })
  pendingInvites!: number;
  @ApiProperty() classrooms!: number;
  @ApiProperty({
    description: 'Org-owned problems only; the platform-global catalog is charged to no org.',
  })
  problems!: number;
  @ApiProperty() assignments!: number;
  @ApiProperty() submissions!: number;

  /** A tenant with no rows at all — used for orgs absent from every group-by. */
  static zero(): OrgCountsDto {
    return {
      users: 0,
      admins: 0,
      professors: 0,
      students: 0,
      activeUsers: 0,
      inactiveUsers: 0,
      pendingInvites: 0,
      classrooms: 0,
      problems: 0,
      assignments: 0,
      submissions: 0,
    };
  }
}

/** One org card on the platform console grid. */
export class PlatformOrgTileDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ enum: OrganizationType }) type!: OrganizationType;
  @ApiProperty({ enum: OrganizationStatus }) status!: OrganizationStatus;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ type: OrgCountsDto }) counts!: OrgCountsDto;

  static from(org: Organization, counts: OrgCountsDto): PlatformOrgTileDto {
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      type: org.type,
      status: org.status,
      createdAt: org.createdAt,
      counts,
    };
  }
}

export class PlatformOrgTotalsDto {
  @ApiProperty() total!: number;
  @ApiProperty() active!: number;
  @ApiProperty() suspended!: number;
}

/** Org-less rows the console must surface rather than silently drop (#105). */
export class PlatformUnassignedDto {
  @ApiProperty({ description: 'Self-registered students awaiting assignment or a claim.' })
  students!: number;
  @ApiProperty() activeStudents!: number;
  @ApiProperty() inactiveStudents!: number;
  @ApiProperty({
    description:
      'Org-less admin/professor rows. chk_users_org_required forbids these, so a ' +
      'non-zero value is a data-integrity alarm, not a normal state.',
  })
  orphanedStaff!: number;
  @ApiProperty() activeOrphanedStaff!: number;
  @ApiProperty() inactiveOrphanedStaff!: number;
}

export class PlatformUserTotalsDto {
  @ApiProperty({
    description: 'Every user row: org members, org-less SuperAdmins, and the unassigned.',
  })
  total!: number;
  @ApiProperty({ description: 'Platform operators — org-less by definition (§5.3).' })
  superAdmins!: number;
  @ApiProperty() admins!: number;
  @ApiProperty() professors!: number;
  @ApiProperty() students!: number;
  @ApiProperty() active!: number;
  @ApiProperty() inactive!: number;
  @ApiProperty() pendingInvites!: number;
  @ApiProperty({ type: PlatformUnassignedDto }) unassigned!: PlatformUnassignedDto;
}

export class PlatformProblemTotalsDto {
  @ApiProperty() total!: number;
  @ApiProperty({ description: 'scope=global — the platform catalog, owned by no org.' })
  global!: number;
  @ApiProperty({ description: 'scope=org — summed across every tenant.' })
  org!: number;
}

export class PlatformContentTotalsDto {
  @ApiProperty() classrooms!: number;
  @ApiProperty({ type: PlatformProblemTotalsDto }) problems!: PlatformProblemTotalsDto;
  @ApiProperty() assignments!: number;
  @ApiProperty() submissions!: number;
}

/**
 * `GET /platform/overview` (#63) — cross-org KPIs plus one tile per org. Unlike
 * `GET /admin/overview` (which scopes to the caller's org) this is deliberately
 * unscoped: it is only reachable behind @Platform.
 */
export class PlatformOverviewDto {
  @ApiProperty({ description: 'ISO timestamp — these are live counts, not cached.' })
  generatedAt!: string;
  @ApiProperty({ type: PlatformOrgTotalsDto }) organizations!: PlatformOrgTotalsDto;
  @ApiProperty({ type: PlatformUserTotalsDto }) users!: PlatformUserTotalsDto;
  @ApiProperty({ type: PlatformContentTotalsDto }) content!: PlatformContentTotalsDto;
  @ApiProperty({ type: [PlatformOrgTileDto] }) tiles!: PlatformOrgTileDto[];
}
