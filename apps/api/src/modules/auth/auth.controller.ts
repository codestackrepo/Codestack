import { Body, Controller, Get, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
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
import { RegisterDto } from './dto/register.dto';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { SessionContextService } from './session-context.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly authCfg: AuthConfig;

  constructor(
    private readonly auth: AuthService,
    private readonly session: SessionContextService,
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
