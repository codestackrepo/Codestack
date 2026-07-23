import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CreateUserDto } from '../../users/dto/create-user.dto';

/**
 * Public self-registration. Role is forced to student and cannot be set here —
 * UNLESS a valid professor `inviteToken` is supplied, in which case AuthService
 * consumes the invite and grants the professor role (see AuthService.register).
 */
export class RegisterDto extends OmitType(CreateUserDto, ['role'] as const) {
  @ApiPropertyOptional({ description: 'Professor invite token (from an invite link)' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  inviteToken?: string;
}
