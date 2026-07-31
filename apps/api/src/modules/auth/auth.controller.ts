import { Body, Controller, Get, HttpCode, Param, Post, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { AuthConfig } from '../../config/configuration';
import { AllowsUnassigned } from '../../common/decorators/allows-unassigned.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { AuthService } from './auth.service';
import { clearAuthCookies, setAuthCookies } from './cookie.util';
import { SessionContextDto } from './dto/session-context.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto, ResetPasswordDto, ResetPreviewDto } from './dto/password-reset.dto';
import { RegisterDto } from './dto/register.dto';
import { PasswordResetService } from './password-reset.service';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { SessionContextService } from './session-context.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly authCfg: AuthConfig;

  constructor(
    private readonly auth: AuthService,
    private readonly session: SessionContextService,
    private readonly passwordReset: PasswordResetService,
    config: ConfigService,
  ) {
    this.authCfg = config.getOrThrow<AuthConfig>('auth');
  }

  @Public()
  @Post('register')
  @Throttle({ minute: { limit: 5, ttl: 60_000 } })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: UserResponseDto; message: string }> {
    const user = await this.auth.register(dto);
    const tokens = await this.auth.login(user);
    setAuthCookies(res, tokens, this.authCfg);
    return { user: UserResponseDto.from(user), message: 'Registration successful' };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ minute: { limit: 10, ttl: 60_000 } })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: UserResponseDto; message: string }> {
    const user = await this.auth.validateCredentials(dto.email, dto.password);
    const tokens = await this.auth.login(user);
    setAuthCookies(res, tokens, this.authCfg);
    return { user: UserResponseDto.from(user), message: 'Login successful' };
  }

  @Public()
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    const tokens = await this.auth.refresh(user);
    setAuthCookies(res, tokens, this.authCfg);
    return { message: 'Token refreshed' };
  }

  /**
   * ALWAYS 200, with an identical body, whether or not the address exists.
   *
   * `users.email` is globally unique, so any discrimination here — a different
   * status, a different message, even a materially different latency — is a
   * definite "this person has an account", i.e. an enumeration oracle against a
   * public login page. The service decides silently whether to send anything.
   */
  @Public()
  @Post('forgot-password')
  @HttpCode(200)
  @Throttle({ minute: { limit: 3, ttl: 60_000 }, hour: { limit: 10, ttl: 3_600_000 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ message: string }> {
    await this.passwordReset.requestReset(dto.email);
    return {
      message: 'If an account exists for that address, a password reset link is on its way.',
    };
  }

  /**
   * Never 4xxs, mirroring `GET /invites/:token/preview`. A 4xx would put the raw
   * token into AllExceptionsFilter's `path` field and thence into the logs.
   */
  @Public()
  @Get('reset/:token/preview')
  @Throttle({ minute: { limit: 20, ttl: 60_000 }, hour: { limit: 100, ttl: 3_600_000 } })
  preview(@Param('token') token: string): Promise<ResetPreviewDto> {
    return this.passwordReset.preview(token);
  }

  /** Consumes the token, sets the password, and signs the user in. */
  @Public()
  @Post('reset-password')
  @HttpCode(200)
  @Throttle({ minute: { limit: 5, ttl: 60_000 }, day: { limit: 50, ttl: 86_400_000 } })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: UserResponseDto; message: string }> {
    const user = await this.passwordReset.resetPassword(dto.token, dto.password);
    // Landing signed in is the point: the alternative is bouncing someone who has
    // just proved mailbox access to a login form to retype what they set 2s ago.
    const tokens = await this.auth.login(user);
    setAuthCookies(res, tokens, this.authCfg);
    return { user: UserResponseDto.from(user), message: 'Password updated' };
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response): { message: string } {
    clearAuthCookies(res, this.authCfg);
    return { message: 'Successfully logged out' };
  }

  // Session bootstrap. `request.user` is the projection JwtAuthGuard re-stamped
  // from the fresh DB row, so this reflects a just-applied assignment or revoke.
  // The full aggregated contract is assembled by SessionContextService so that
  // module-access/org/feature/quota subsystems contribute a field without editing
  // this controller (#54, §6 shared-file ownership).
  // @AllowsUnassigned: this is the ONE route an org-less student must reach, or
  // the frontend cannot even discover that they are confined — it would see a 403
  // and bounce to /login, which succeeds, which re-fetches verify, which 403s.
  @Get('verify')
  @AllowsUnassigned()
  verify(@CurrentUser() user: AuthenticatedUser): Promise<SessionContextDto> {
    return this.session.build(user);
  }
}
