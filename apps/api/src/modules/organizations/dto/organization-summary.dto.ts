import { ApiProperty } from '@nestjs/swagger';
import { Organization } from '../entities/organization.entity';
import { OrganizationStatus, OrganizationType } from '../enums/organization.enums';

/**
 * Compact org view for the session contract (#54) and member-facing screens.
 * Deliberately omits internal fields (clerkOrgId, createdById, settings) — those
 * are for the SuperAdmin console (#62), not every session bootstrap.
 */
export class OrganizationSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ enum: OrganizationType }) type!: OrganizationType;
  @ApiProperty({ enum: OrganizationStatus }) status!: OrganizationStatus;

  static from(org: Organization): OrganizationSummaryDto {
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      type: org.type,
      status: org.status,
    };
  }
}
