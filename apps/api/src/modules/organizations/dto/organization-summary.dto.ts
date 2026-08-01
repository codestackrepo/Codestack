import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Organization } from '../entities/organization.entity';
import { OrganizationStatus, OrganizationType } from '../enums/organization.enums';
import { OrgBranding, readOrgBranding } from '../org-branding';

/**
 * Compact org view for the session contract (#54) and member-facing screens.
 * Deliberately omits internal fields (createdById, settings) — those
 * are for the SuperAdmin console (#62), not every session bootstrap.
 */
export class OrganizationSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ enum: OrganizationType }) type!: OrganizationType;
  @ApiProperty({ enum: OrganizationStatus }) status!: OrganizationStatus;

  /**
   * Co-branding for the "CodeStack × institution" lockup (#118), or undefined.
   *
   * Just this one slice of `settings`, never the whole blob — the rest holds
   * operational configuration that member-facing screens have no business seeing, which
   * is why this DTO omits `settings` in the first place. Read through
   * `readOrgBranding`, which is total: a malformed value becomes "no branding" rather
   * than an exception on a session bootstrap.
   */
  @ApiPropertyOptional({
    description: 'Per-org logo and display name for the co-branded lockup.',
  })
  branding?: OrgBranding;

  static from(org: Organization): OrganizationSummaryDto {
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      type: org.type,
      status: org.status,
      branding: readOrgBranding(org.settings),
    };
  }
}
