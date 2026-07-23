import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { ProfessorInvite } from '../entities/professor-invite.entity';
import { ProfessorRequest } from '../entities/professor-request.entity';
import { InviteStatus, RequestStatus } from '../enums/onboarding.enums';

// ---- Requests (input) ----

export class CreateInviteDto {
  @ApiPropertyOptional({ example: 'prof@university.edu', description: 'Advisory — pre-fills register' })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 365, default: 14, description: 'Days until expiry' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  expiresInDays?: number;
}

export class CreateProfessorRequestDto {
  @ApiPropertyOptional({ description: 'Why you need professor access', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}

export class RejectRequestDto {
  @ApiPropertyOptional({ description: 'Reason shown to the requester', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class ListRequestsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: RequestStatus, description: 'Filter by status' })
  @IsOptional()
  @IsEnum(RequestStatus)
  status?: RequestStatus;
}

// ---- Responses (output) ----

export class InviteResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() token!: string;
  @ApiProperty({ nullable: true }) email!: string | null;
  @ApiProperty({ enum: InviteStatus }) status!: InviteStatus;
  @ApiProperty({ nullable: true }) expiresAt!: string | null;
  @ApiProperty({ nullable: true }) consumedAt!: string | null;
  @ApiProperty() createdAt!: string;

  static from(invite: ProfessorInvite): InviteResponseDto {
    return {
      id: invite.id,
      token: invite.token,
      email: invite.email,
      status: invite.status,
      expiresAt: invite.expiresAt ? invite.expiresAt.toISOString() : null,
      consumedAt: invite.consumedAt ? invite.consumedAt.toISOString() : null,
      createdAt: invite.createdAt.toISOString(),
    };
  }
}

/** Public, minimal view returned by the token-preview endpoint. */
export class InvitePreviewDto {
  @ApiProperty() valid!: boolean;
  @ApiProperty({ nullable: true }) email!: string | null;
  @ApiProperty({ example: 'professor' }) role!: string;

  static valid(invite: ProfessorInvite): InvitePreviewDto {
    return { valid: true, email: invite.email, role: 'professor' };
  }

  static invalid(): InvitePreviewDto {
    return { valid: false, email: null, role: 'professor' };
  }
}

export class ProfessorRequestResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiPropertyOptional() userEmail?: string;
  @ApiPropertyOptional() userName?: string;
  @ApiProperty({ enum: RequestStatus }) status!: RequestStatus;
  @ApiProperty() message!: string;
  @ApiProperty() decisionReason!: string;
  @ApiProperty({ nullable: true }) reviewedAt!: string | null;
  @ApiProperty() createdAt!: string;

  static from(req: ProfessorRequest): ProfessorRequestResponseDto {
    return {
      id: req.id,
      userId: req.userId,
      // `user` is only present when the query eager-joined it (admin queue).
      userEmail: req.user?.email,
      userName: req.user ? `${req.user.firstName} ${req.user.lastName}`.trim() : undefined,
      status: req.status,
      message: req.message,
      decisionReason: req.decisionReason,
      reviewedAt: req.reviewedAt ? req.reviewedAt.toISOString() : null,
      createdAt: req.createdAt.toISOString(),
    };
  }
}
