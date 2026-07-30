import { ApiProperty } from '@nestjs/swagger';
import { Organization } from '../../organizations/entities/organization.entity';
import { OrganizationStatus, OrganizationType } from '../../organizations/enums/organization.enums';

/** SuperAdmin-facing org view (#62). */
export class PlatformOrganizationDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ enum: OrganizationType }) type!: OrganizationType;
  @ApiProperty({ enum: OrganizationStatus }) status!: OrganizationStatus;
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
      createdById: org.createdById,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
    };
  }
}
