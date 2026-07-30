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
    // A password-less account (an invite not yet accepted) cannot password-login.
    if (!user || !user.isActive || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await this.users.verifyPassword(user, password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return user;
  }

  /**
   * Self-registration. ALWAYS a student, and always org-less — there is no token
   * branch here any more.
   *
   * Registration used to accept a professor `inviteToken` and grant the professor
   * role inline. Invites are now their own surface (`POST /invites/accept`), which
   * is the only way a registration can yield anything but a STUDENT, and which
   * charges the org's seat quota in the same transaction that consumes the invite.
   * Keeping a second, quota-free path into a role would have made the two
   * disagree.
   */
  register(dto: RegisterDto): Promise<User> {
    return this.users.create({ ...dto, role: Role.STUDENT });
  }

  async login(user: User): Promise<TokenPair> {
    await this.users.updateLastLogin(user.id);
    return this.issueTokens({
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    });
  }

  /** Rotates tokens for a valid refresh session. */
  async refresh(user: AuthenticatedUser): Promise<TokenPair> {
    // Re-read the user to pick up role changes / deactivation.
    const fresh = await this.users.getById(user.id);
    if (!fresh.isActive) throw new UnauthorizedException('Account disabled');
    return this.issueTokens({
      id: fresh.id,
      email: fresh.email,
      role: fresh.role,
      organizationId: fresh.organizationId,
    });
  }

  private async issueTokens(user: AuthenticatedUser): Promise<TokenPair> {
    const base = {
      sub: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    };
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
