import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../../common/enums/role.enum';
import { User } from '../entities/user.entity';

/** Public user view — never exposes the password hash. */
export class UserResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty({ enum: Role }) role!: Role;
  // Tenant the user belongs to (null only for SUPERADMIN). Part of the #54
  // session contract so the client knows its org without a second call.
  @ApiProperty({ nullable: true }) organizationId!: string | null;
  // Admin-relevant, non-sensitive fields for the user-management table (#40).
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ nullable: true }) lastLoginAt!: Date | null;
  @ApiProperty() createdAt!: Date;

  static from(user: User): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      organizationId: user.organizationId,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    };
  }
}
