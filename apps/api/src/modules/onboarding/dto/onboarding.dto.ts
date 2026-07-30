import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { ProfessorRequest } from '../entities/professor-request.entity';
import { RequestStatus } from '../enums/onboarding.enums';

// ---- Requests (input) ----

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
