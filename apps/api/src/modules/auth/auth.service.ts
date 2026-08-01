import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthConfig } from '../../config/configuration';
import { UserOrigin } from '../../common/enums/user-origin.enum';
import { AuthenticatedUser, JwtPayload } from '../../common/types/authenticated-user';
import { MailService } from '../mail/mail.service';
import { MailTemplate } from '../mail/mail.types';
import { CommunityOrgService } from '../organizations/community-org.service';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { EmailVerificationService } from './email-verification.service';

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
    private readonly emailVerification: EmailVerificationService,
    private readonly community: CommunityOrgService,
    private readonly mail: MailService,
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

    /**
     * No session until the address is confirmed (#118).
     *
     * Placed AFTER the password check, and the order is the whole security
     * property: answering `email_unverified` to someone who has NOT supplied the
     * right password would confirm that the account exists, turning the login form
     * into the enumeration oracle that `forgot-password` and `resend-verification`
     * go to such lengths to avoid. Only a caller who already proved they hold the
     * credentials learns anything here — and they learn something they need.
     *
     * A distinct 403 rather than the generic 401 for that same reason: it is safe
     * to be specific at this point, and the frontend needs to tell these apart to
     * offer "resend the link" instead of "check your password".
     *
     * Every account that predates verification was grandfathered by migration
     * 1785590000000, and every path that creates an account with a password stamps
     * it, so this gate is inert until self-signup starts minting unverified users.
     */
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException({
        reason: 'email_unverified',
        message: 'Confirm your email address to sign in. Check your inbox for the link.',
      });
    }
    return user;
  }

  /**
   * Open-platform self-registration. ALWAYS a student, always into the community
   * tenant, and always unverified.
   *
   * Registration used to accept a professor `inviteToken` and grant the professor
   * role inline. Invites are now their own surface (`POST /invites/accept`), which
   * is the only way a registration can yield anything but a STUDENT, and which
   * charges the org's seat quota in the same transaction that consumes the invite.
   * Keeping a second, quota-free path into a role would have made the two
   * disagree.
   *
   * RETURNS NOTHING, and never throws for a taken address (#118). The caller answers
   * an identical 200 whatever happened here, so this method's job is to pick the
   * right side effect silently. Two things drove that:
   *
   *  - `users.create` answered 409 "Email already registered", which made a public
   *    endpoint a definite oracle for "this person has an account here". That was
   *    already true before this change; it is fixed here rather than preserved.
   *  - Signup no longer issues cookies. An account that cannot log in until it is
   *    verified must not be handed a session at creation, or the gate is decoration.
   *
   * THE PRE-REGISTRATION TAKEOVER, which dictates the middle branch. An attacker
   * signs up as victim@x with their own password; the victim later signs up "for the
   * first time" with theirs. If that second attempt overwrote the stored password,
   * fine — but if it did NOT, and the victim then verified via the mailed link, the
   * account would be verified and hold the ATTACKER's password. So the re-signup
   * path must never touch a stored credential or name: it only re-sends the
   * verification link. The victim who verifies still cannot be logged into by the
   * attacker, because the attacker's password was never a *verified* account's
   * password — and the victim recovers the account through forgot-password, which
   * proves mailbox access. Overwriting instead would hand anyone a way to change the
   * password of any unverified account by re-submitting the signup form.
   */
  async register(dto: RegisterDto): Promise<void> {
    // Hashed in EVERY branch, before any decision, and the cost is the point: argon2
    // is ~100ms, so computing it only for new addresses would make "address taken"
    // measurably faster than "address free" and reinstate the oracle in the timing
    // domain, having just closed it in the status domain.
    const passwordHash = await this.users.hashPassword(dto.password);
    const email = dto.email.toLowerCase();
    const existing = await this.users.findByEmail(email);

    if (!existing) {
      const user = await this.users.createOpenSelfSignup(
        { email, firstName: dto.firstName, lastName: dto.lastName, passwordHash },
        this.community.id,
      );
      await this.emailVerification.issue(user);
      return;
    }

    // Unverified AND self-signed-up: the address is claimed but unproven, so the
    // rightful owner may still be trying to get in. Re-send the link and change
    // nothing else — see the takeover note above.
    if (!existing.emailVerifiedAt && existing.origin === UserOrigin.OPEN) {
      await this.emailVerification.issue(existing);
      return;
    }

    // A usable account: verified, or closed-origin (invited/staff-created, where
    // someone already vouched for the address). Tell the MAILBOX OWNER, not the
    // caller — the response is identical either way.
    await this.mail.enqueue({
      to: existing.email,
      template: MailTemplate.ACCOUNT_EXISTS,
      params: {
        firstName: existing.firstName,
        lastName: existing.lastName,
        loginUrl: this.mail.webUrl('login'),
        forgotPasswordUrl: this.mail.webUrl('forgot-password'),
      },
    });
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
