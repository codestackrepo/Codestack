import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { Role } from '../../../common/enums/role.enum';

/**
 * Filters for `GET /users`.
 *
 * The route bound `PaginationQueryDto` (page/limit only) while the global pipe
 * runs `whitelist: true, forbidNonWhitelisted: true`, so `?role=&status=&q=` was
 * a hard **400** — the People screen could not filter at all.
 */
export class ListUsersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  /**
   * `@Transform`, NOT `@Type(() => Boolean)`. `Boolean('false')` is `true` —
   * every JS truthiness rule says a non-empty string is truthy — so `@Type` would
   * make `?isActive=false` filter for ACTIVE users, showing exactly the opposite
   * of what the operator asked for, silently.
   */
  @ApiPropertyOptional({ description: 'true | false' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Substring match on name or email', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}
