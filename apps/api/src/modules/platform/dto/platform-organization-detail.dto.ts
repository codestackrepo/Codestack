import { ApiProperty } from '@nestjs/swagger';
import { Organization } from '../../organizations/entities/organization.entity';
import { OrgCountsDto } from './platform-overview.dto';
import { PlatformOrganizationDto } from './platform-organization.dto';

/**
 * One resource's usage against its quota. `limit === null` means UNLIMITED and is
 * NOT interchangeable with `0` (which blocks the resource outright) — §5.4 calls
 * out coalescing NULL to 0 as the footgun to avoid, so every read here tests
 * `=== null` explicitly.
 */
export class QuotaUsageDto {
  @ApiProperty() used!: number;
  @ApiProperty({ nullable: true, description: 'null = unlimited; 0 = fully blocked.' })
  limit!: number | null;
  @ApiProperty({ nullable: true, description: 'null when unlimited; floored at 0.' })
  remaining!: number | null;
  @ApiProperty({
    description: 'used > limit — only reachable if a limit was lowered after the fact.',
  })
  exceeded!: boolean;

  static of(used: number, limit: number | null): QuotaUsageDto {
    return {
      used,
      limit,
      remaining: limit === null ? null : Math.max(0, limit - used),
      exceeded: limit !== null && used > limit,
    };
  }
}

/**
 * Counts vs quotas for one org, keyed by resource concept rather than by the
 * `org_quotas.resource` string so the wire contract does not depend on the quota
 * subsystem's enum (owned by #66).
 */
export class OrgQuotaUsageDto {
  @ApiProperty({
    type: QuotaUsageDto,
    description:
      'MAX_USERS — active members + pending invites (seats are reserved at invite time).',
  })
  users!: QuotaUsageDto;
  @ApiProperty({ type: QuotaUsageDto, description: 'MAX_PROBLEMS — org-scoped problems only.' })
  problems!: QuotaUsageDto;
  @ApiProperty({ type: QuotaUsageDto, description: 'MAX_ASSIGNMENTS.' })
  assignments!: QuotaUsageDto;
}

/**
 * `GET /platform/organizations/:id` (#63). A strict superset of the list-row DTO:
 * the org row plus its live census and that census read against quotas.
 */
export class PlatformOrganizationDetailDto extends PlatformOrganizationDto {
  @ApiProperty({ type: OrgCountsDto }) counts!: OrgCountsDto;
  @ApiProperty({ type: OrgQuotaUsageDto }) usage!: OrgQuotaUsageDto;

  static fromOrg(
    org: Organization,
    counts: OrgCountsDto,
    usage: OrgQuotaUsageDto,
  ): PlatformOrganizationDetailDto {
    return { ...PlatformOrganizationDto.from(org), counts, usage };
  }
}
