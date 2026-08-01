import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { OrganizationApplication } from '../entities/organization-application.entity';
import { OrgApplicationStatus } from '../enums/organization-application.enums';
import { OrganizationType } from '../enums/organization.enums';

/**
 * The PUBLIC application body (#118).
 *
 * Every field is length-capped to its column width. That is not decoration: this is an
 * unauthenticated write, so the DTO is the only thing between a stranger and the
 * table, and a 200-character `organization_name` column with no `@MaxLength` fails at
 * the driver with a raw error instead of a clean 400.
 *
 * No file upload and no rich text — a logo arrives later, set by the superadmin, so
 * this endpoint accepts nothing it would have to store or scan.
 */
export class CreateOrganizationApplicationDto {
  @ApiProperty({ example: 'Acme University', maxLength: 200 })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  organizationName!: string;

  /**
   * `community` is deliberately not offered. Only the platform's own open tenant has
   * that type and it already exists — DB-enforced by `chk_org_application_type`, which
   * is narrower than the organizations CHECK for exactly this reason.
   */
  @ApiPropertyOptional({ enum: [OrganizationType.UNIVERSITY, OrganizationType.ORGANIZATION] })
  @IsOptional()
  @IsEnum(OrganizationType)
  organizationType?: OrganizationType;

  @ApiPropertyOptional({ example: 'https://acme.edu', maxLength: 255 })
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(255)
  website?: string;

  @ApiProperty({ example: 'Ada Lovelace', maxLength: 150 })
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  contactName!: string;

  @ApiProperty({ example: 'ada@acme.edu' })
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  contactEmail!: string;

  @ApiPropertyOptional({ description: 'Anything else the reviewer should know.', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}

/**
 * What a superadmin supplies when approving.
 *
 * NO SLUG FIELD — it is derived from the organization name (`org-slug.util`), so the
 * reviewer has one fewer thing to invent and the value is shown back to them
 * afterwards.
 *
 * Both seat counts are REQUIRED. Blank-means-unlimited remains the storage semantic
 * for the community tenant and for organizations that predate this, but no tenant is
 * ever CREATED without deliberate caps — that was the explicit decision, and making
 * the fields optional here is exactly how an accidental unlimited tenant would happen.
 */
export class ApproveOrganizationApplicationDto {
  @ApiProperty({
    description: 'Address the org-admin invite is sent to. Prefilled from the contact, editable.',
    example: 'admin@acme.edu',
  })
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  adminEmail!: string;

  @ApiProperty({
    description: 'Teaching seats. Counts professors only — never admins.',
    example: 25,
  })
  @IsInt()
  @Min(0)
  maxProfessors!: number;

  @ApiProperty({ example: 500 })
  @IsInt()
  @Min(0)
  maxStudents!: number;

  /**
   * Content caps, required for the same reason the seat caps are: a tenant approved
   * with no limit is a tenant nobody decided to give unlimited to. Leaving these to a
   * later edit meant every organization was born unbounded on problems and
   * assignments, and the superadmin only found out by looking.
   *
   * `0` blocks the resource entirely and is a legitimate choice — the null-means-
   * unlimited value is deliberately NOT expressible here, because "unlimited" should
   * be a deliberate later edit in the quota form, not the path of least resistance at
   * approval time.
   */
  @ApiProperty({ description: 'Org-owned problems. 0 blocks authoring entirely.', example: 200 })
  @IsInt()
  @Min(0)
  maxProblems!: number;

  @ApiProperty({ example: 100 })
  @IsInt()
  @Min(0)
  maxAssignments!: number;

  /**
   * Optional, unlike the two above. `max_users` is the pre-existing total cap and an
   * absent row means unlimited; leaving it out means "bounded by the per-role caps
   * only", which is a coherent choice. The per-role caps are required because they are
   * what the approval form is FOR.
   */
  @ApiPropertyOptional({ description: 'Overall member cap. Omit for no overall limit.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxUsers?: number;
}

export class RejectOrganizationApplicationDto {
  @ApiPropertyOptional({ description: 'Shown to the applicant verbatim.', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

/** Review-queue projection. Includes the applicant's own text — reviewers need it. */
export class OrganizationApplicationDto {
  @ApiProperty() id!: string;
  @ApiProperty() organizationName!: string;
  @ApiProperty({ enum: OrganizationType }) organizationType!: OrganizationType;
  @ApiProperty({ nullable: true }) website!: string | null;
  @ApiProperty() contactName!: string;
  @ApiProperty() contactEmail!: string;
  @ApiProperty() message!: string;
  @ApiProperty({ enum: OrgApplicationStatus }) status!: OrgApplicationStatus;
  @ApiProperty({ nullable: true }) reviewedById!: string | null;
  @ApiProperty({ nullable: true }) reviewedAt!: Date | null;
  @ApiProperty() decisionReason!: string;
  /** The tenant this produced, once approved. */
  @ApiProperty({ nullable: true }) organizationId!: string | null;
  @ApiProperty() createdAt!: Date;

  static from(row: OrganizationApplication): OrganizationApplicationDto {
    return {
      id: row.id,
      organizationName: row.organizationName,
      organizationType: row.organizationType,
      website: row.website,
      contactName: row.contactName,
      contactEmail: row.contactEmail,
      message: row.message,
      status: row.status,
      reviewedById: row.reviewedById,
      reviewedAt: row.reviewedAt,
      decisionReason: row.decisionReason,
      organizationId: row.organizationId,
      createdAt: row.createdAt,
    };
  }
}
