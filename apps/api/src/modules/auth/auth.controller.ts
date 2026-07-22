import { Body, Controller, Get, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { AuthConfig } from '../../config/configuration';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { clearAuthCookies, setAuthCookies } from './cookie.util';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly authCfg: AuthConfig;

  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
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

  @Get('verify')
  async verify(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ user: UserResponseDto; isValid: boolean }> {
    const full = await this.users.getById(user.id);
    return { user: UserResponseDto.from(full), isValid: true };
  }
}
