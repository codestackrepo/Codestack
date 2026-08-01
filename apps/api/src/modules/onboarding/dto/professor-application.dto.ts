import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { OrgApplicationStatus } from '../../organizations/enums/organization-application.enums';
import { ProfessorApplication } from '../entities/professor-application.entity';

/**
 * The PUBLIC professor application (#118).
 *
 * No password field. An approved applicant sets one by accepting the invite that
 * approval mints — collecting it here would mean storing a credential for an account
 * that may never exist, and for a person we have not yet decided to admit.
 */
export class CreateProfessorApplicationDto {
  @ApiProperty({ example: 'ada@lovelace.dev' })
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

  @ApiProperty({ maxLength: 150 })
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  firstName!: string;

  @ApiProperty({ maxLength: 150 })
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  lastName!: string;

  /**
   * OPTIONAL, and deliberately so: an independent tutor or a bootcamp instructor has no
   * institution, and requiring one would exclude exactly the people the open platform
   * exists for. Context for the reviewer, never a lookup — naming an institution here
   * does not associate the applicant with any tenant.
   */
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  institution?: string;

  @ApiPropertyOptional({ description: 'What they teach, and why.', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}

export class RejectProfessorApplicationDto {
  @ApiPropertyOptional({ description: 'Shown to the applicant verbatim.', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class ProfessorApplicationDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty({ nullable: true }) institution!: string | null;
  @ApiProperty() message!: string;
  @ApiProperty({ enum: OrgApplicationStatus }) status!: OrgApplicationStatus;
  @ApiProperty({ nullable: true }) reviewedById!: string | null;
  @ApiProperty({ nullable: true }) reviewedAt!: Date | null;
  @ApiProperty() decisionReason!: string;
  @ApiProperty({ nullable: true }) inviteId!: string | null;
  @ApiProperty() createdAt!: Date;

  static from(row: ProfessorApplication): ProfessorApplicationDto {
    return {
      id: row.id,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      institution: row.institution,
      message: row.message,
      status: row.status,
      reviewedById: row.reviewedById,
      reviewedAt: row.reviewedAt,
      decisionReason: row.decisionReason,
      inviteId: row.inviteId,
      createdAt: row.createdAt,
    };
  }
}
