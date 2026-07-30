import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { Role } from '../../../common/enums/role.enum';
import { OrgInvite } from '../entities/org-invite.entity';
import { OrgInviteKind, OrgInviteStatus } from '../enums/org-invite.enums';

// ---- input ----

/**
 * Mint an invite.
 *
 * There is deliberately NO organization field. On the org path the tenant comes
 * from `actor.organizationId`, and the global pipe runs `forbidNonWhitelisted`,
 * so a client that tries to smuggle one gets a 400 rather than being silently
 * ignored. The SuperAdmin path takes the org as a ROUTE PARAM on a separate
 * controller.
 *
 * `role` is validated as a member of the enum here, which includes `superadmin` —
 * the enum check is a shape check, not an authorization one. `assertMayInvite` is
 * what rejects it.
 */
export class CreateInviteDto {
  @ApiProperty({ example: 'ada@university.edu' })
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

  @ApiProperty({ enum: Role, default: Role.STUDENT })
  @IsEnum(Role)
  role!: Role;

  @ApiPropertyOptional({ maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  firstName?: string;

  @ApiPropertyOptional({ maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  lastName?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 90, default: 14 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  expiresInDays?: number;
}

/**
 * Accept an invite and create the account.
 *
 * The password rule mirrors `RegisterDto` — a weaker one here would make the
 * invite path the cheapest way to plant a guessable account.
 */
export class AcceptInviteDto {
  @ApiProperty({ description: 'The raw token from the invite link.' })
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token!: string;

  @ApiProperty({ minLength: 8, example: 'Password1' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'password must contain at least one letter and one number',
  })
  password!: string;

  @ApiPropertyOptional({ maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  firstName?: string;

  @ApiPropertyOptional({ maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  lastName?: string;
}

/** Claim an invite as an already-authenticated, org-less user. No password. */
export class ClaimInviteDto {
  @ApiProperty()
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token!: string;
}

export class ListInvitesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: OrgInviteStatus })
  @IsOptional()
  @IsEnum(OrgInviteStatus)
  status?: OrgInviteStatus;

  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

// ---- output ----

/**
 * Staff-facing invite row.
 *
 * Carries NO `token` and NO `tokenHash`. The retired `professor_invites` surface
 * returned the plaintext token to the admin list, which made every admin screen
 * (and every screenshot, and every browser cache) a credential store. The
 * replacement for "Copy link" is "Resend", which re-mints.
 */
export class InviteResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: Role }) role!: Role;
  @ApiProperty({ enum: OrgInviteStatus }) status!: OrgInviteStatus;
  @ApiProperty({ enum: OrgInviteKind }) kind!: OrgInviteKind;
  @ApiProperty({ nullable: true }) firstName!: string | null;
  @ApiProperty({ nullable: true }) lastName!: string | null;
  @ApiProperty() expiresAt!: string;
  @ApiProperty({ nullable: true }) acceptedAt!: string | null;
  @ApiProperty({ nullable: true }) lastSentAt!: string | null;
  @ApiProperty() sendCount!: number;
  @ApiProperty({ nullable: true }) invitedById!: string | null;
  @ApiProperty() createdAt!: string;

  static from(invite: OrgInvite): InviteResponseDto {
    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      status: invite.status,
      kind: invite.kind,
      firstName: invite.firstName,
      lastName: invite.lastName,
      expiresAt: invite.expiresAt.toISOString(),
      acceptedAt: invite.acceptedAt ? invite.acceptedAt.toISOString() : null,
      lastSentAt: invite.lastSentAt ? invite.lastSentAt.toISOString() : null,
      sendCount: invite.sendCount,
      invitedById: invite.invitedById,
      createdAt: invite.createdAt.toISOString(),
    };
  }
}

/**
 * Public, unauthenticated token preview — what the /invite/:token page renders
 * before anyone signs in.
 *
 * `valid: false` carries NO identity fields. An invalid or already-accepted token
 * must not disclose the address it was minted for, or the preview endpoint
 * becomes an oracle for "does this token exist and who is it for".
 */
export class InvitePreviewDto {
  @ApiProperty() valid!: boolean;
  @ApiProperty({ nullable: true }) email!: string | null;
  @ApiProperty({ nullable: true, enum: Role }) role!: Role | null;
  @ApiProperty({ nullable: true }) organizationName!: string | null;
  @ApiProperty({ nullable: true, enum: OrgInviteKind }) kind!: OrgInviteKind | null;

  static valid(invite: OrgInvite, organizationName: string): InvitePreviewDto {
    return {
      valid: true,
      email: invite.email,
      role: invite.role,
      organizationName,
      kind: invite.kind,
    };
  }

  static invalid(): InvitePreviewDto {
    return { valid: false, email: null, role: null, organizationName: null, kind: null };
  }
}
