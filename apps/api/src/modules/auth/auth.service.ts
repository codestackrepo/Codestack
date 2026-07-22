import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthConfig } from '../../config/configuration';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser, JwtPayload } from '../../common/types/authenticated-user';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';

export interface TokenPair {
  access: string;
  refresh: string;
}

@Injectable()
export class AuthService {
  private readonly auth: AuthConfig;

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.auth = config.getOrThrow<AuthConfig>('auth');
  }

  async validateCredentials(email: string, password: string): Promise<User> {
    const user = await this.users.findByEmailWithPassword(email);
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');
    const ok = await this.users.verifyPassword(user, password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return user;
  }

  async register(dto: RegisterDto): Promise<User> {
    return this.users.create({ ...dto, role: Role.STUDENT });
  }

  async login(user: User): Promise<TokenPair> {
    await this.users.updateLastLogin(user.id);
    return this.issueTokens({ id: user.id, email: user.email, role: user.role });
  }

  /** Rotates tokens for a valid refresh session. */
  async refresh(user: AuthenticatedUser): Promise<TokenPair> {
    // Re-read the user to pick up role changes / deactivation.
    const fresh = await this.users.getById(user.id);
    if (!fresh.isActive) throw new UnauthorizedException('Account disabled');
    return this.issueTokens({ id: fresh.id, email: fresh.email, role: fresh.role });
  }

  private async issueTokens(user: AuthenticatedUser): Promise<TokenPair> {
    const base = { sub: user.id, email: user.email, role: user.role };
    const [access, refresh] = await Promise.all([
      this.jwt.signAsync({ ...base, type: 'access' } satisfies Omit<JwtPayload, 'iat' | 'exp'>, {
        secret: this.auth.accessSecret,
        expiresIn: this.auth.accessTtl,
      }),
      this.jwt.signAsync({ ...base, type: 'refresh' } satisfies Omit<JwtPayload, 'iat' | 'exp'>, {
        secret: this.auth.refreshSecret,
        expiresIn: this.auth.refreshTtl,
      }),
    ]);
    return { access, refresh };
  }
}
