import { ApiProperty } from '@nestjs/swagger';
import { Organization } from '../../organizations/entities/organization.entity';
import { OrganizationStatus, OrganizationType } from '../../organizations/enums/organization.enums';

/**
 * SuperAdmin-facing org view (#62). Exposes `clerkLinked` (a boolean) rather than
 * the raw clerk_org_id — the console only needs to know whether Clerk mirroring
 * succeeded, not the internal Clerk id.
 */
export class PlatformOrganizationDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ enum: OrganizationType }) type!: OrganizationType;
  @ApiProperty({ enum: OrganizationStatus }) status!: OrganizationStatus;
  @ApiProperty({ description: 'True once a Clerk Organization is linked.' })
  clerkLinked!: boolean;
  @ApiProperty({ nullable: true }) createdById!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  static from(org: Organization): PlatformOrganizationDto {
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      type: org.type,
      status: org.status,
      clerkLinked: Boolean(org.clerkOrgId),
      createdById: org.createdById,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
    };
  }
}
