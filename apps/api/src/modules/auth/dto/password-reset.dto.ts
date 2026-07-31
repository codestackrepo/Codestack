import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'ada@university.edu' })
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'The raw token from the reset link.' })
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token!: string;

  /**
   * Same rule as RegisterDto and AcceptInviteDto. A weaker one here would make
   * the reset path the cheapest way to plant a guessable password on an account
   * whose mailbox was briefly accessible.
   */
  @ApiProperty({ minLength: 8, example: 'Password1' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'password must contain at least one letter and one number',
  })
  password!: string;
}

/**
 * The public preview contract.
 *
 * Carries no token, no role, no organization — the caller is unauthenticated,
 * and holding a token proves mailbox access and nothing else.
 */
export class ResetPreviewDto {
  @ApiProperty({ enum: ['valid', 'expired', 'used', 'not_found'] })
  status!: 'valid' | 'expired' | 'used' | 'not_found';

  @ApiPropertyOptional({
    description: 'Masked address, present only when status is "valid".',
    example: 'ad••••••••@example.edu',
  })
  maskedEmail?: string;
}
