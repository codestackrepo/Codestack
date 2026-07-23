import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

/**
 * All fields optional; password re-hashed only if provided. `role` and
 * `isActive` are accepted here but only honored by UsersService.update() when
 * the actor is an admin — everyone else's changes to them are silently ignored.
 * `isActive` is declared explicitly (CreateUserDto lacks it, so PartialType
 * wouldn't add it).
 */
export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
