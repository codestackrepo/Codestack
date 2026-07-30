import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { Role } from '../../../common/enums/role.enum';
import { ASSIGNABLE_ROLES } from '../user-role.policy';

/**
 * SuperAdmin assignment body. The ORG path has no DTO at all — its target org is
 * `actor.organizationId`, and accepting one in the body would be an org-crossing
 * field on a tenant-scoped route.
 *
 * `@IsIn(ASSIGNABLE_ROLES)` keeps `superadmin` out of the accepted SHAPE, but it
 * is not the boundary: `assertAssignableRole` is, and it runs regardless.
 */
export class AssignOrganizationDto {
  @ApiProperty()
  @IsUUID()
  organizationId!: string;

  @ApiPropertyOptional({ enum: ASSIGNABLE_ROLES, default: Role.STUDENT })
  @IsOptional()
  @IsIn(ASSIGNABLE_ROLES as Role[])
  role?: Role;
}
