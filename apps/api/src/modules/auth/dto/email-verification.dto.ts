import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class ResendVerificationDto {
  @ApiProperty({ example: 'ada@university.edu' })
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;
}

export class VerifyEmailDto {
  /**
   * Bounds match `ResetPasswordDto.token`: the mint is 32 random bytes as base64url
   * (43 chars), so 20..200 accepts every real token while keeping an absurd body
   * from reaching the hash function.
   */
  @ApiProperty({ description: 'The raw token from the verification link.' })
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token!: string;
}

/**
 * The public preview contract.
 *
 * Carries no token, no role, no organization — the caller is unauthenticated, and
 * holding a token proves mailbox access and nothing else. Identical in shape to
 * `ResetPreviewDto` because the page that consumes it behaves identically: it
 * decides between "here is the account, continue" and one of three dead ends.
 */
export class VerificationPreviewDto {
  @ApiProperty({ enum: ['valid', 'expired', 'used', 'not_found'] })
  status!: 'valid' | 'expired' | 'used' | 'not_found';

  @ApiPropertyOptional({
    description: 'Masked address, present only when status is "valid".',
    example: 'ad••••••••@example.edu',
  })
  maskedEmail?: string;
}
