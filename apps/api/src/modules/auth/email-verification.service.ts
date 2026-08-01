import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { UserOrigin } from '../../common/enums/user-origin.enum';
import { MailService } from '../mail/mail.service';
import { MailTemplate } from '../mail/mail.types';
import { hashToken, mintInviteToken } from '../invites/invite-token.util';
import { User } from '../users/entities/user.entity';
import { maskEmail } from './password-reset.service';
import { EmailVerificationToken } from './entities/email-verification-token.entity';

/**
 * 24 hours. Between a reset link's 60 minutes (the user is acting now) and an
 * invite's 14 days (the recipient may act eventually): someone who has just typed
 * their address will come back soon, but not necessarily this minute, and a link
 * that dies over lunch turns a signup into a support ticket.
 */
const TTL_HOURS = 24;

export type VerificationTokenStatus = 'valid' | 'expired' | 'used' | 'not_found';

export interface VerificationPreview {
  status: VerificationTokenStatus;
  /** Present ONLY for `valid`. Masked — enough to recognise, not enough to harvest. */
  maskedEmail?: string;
}

/**
 * Email verification (#118).
 *
 * Deliberately shaped file-for-file on `PasswordResetService`, which is the house
 * pattern for a mailed single-use credential and the quality bar this had to meet.
 * The four properties that matter are the same in both, and each is a decision:
 *
 *  1. Requests are ENUMERATION-SAFE — every branch is silent and the caller always
 *     answers the same 200.
 *  2. Minting sweeps every prior live token first, so there is never more than one
 *     working link per user.
 *  3. Consuming is a conditional UPDATE with `affected === 1`, so two simultaneous
 *     clicks cannot both succeed.
 *  4. `preview` NEVER throws.
 *
 * What differs is only the side effect: this stamps `users.email_verified_at`
 * where the reset service sets a password hash.
 */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    @InjectRepository(EmailVerificationToken)
    private readonly tokens: Repository<EmailVerificationToken>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly mail: MailService,
  ) {}

  /**
   * Mints a verification token and mails it.
   *
   * Public wrapper over `issue`, used by `POST /auth/resend-verification`. The
   * CALLER always answers 200 with an identical body: `users.email` is globally
   * unique, so any discrimination here is a definite "this address has an account",
   * which is an enumeration oracle on a public endpoint.
   *
   * Three cases produce no mail and no row, and all three are indistinguishable from
   * success to the caller: no such address, an already-verified account (re-sending
   * would be a no-op that confirms existence), and a disabled account.
   */
  async requestVerification(email: string): Promise<void> {
    const user = await this.dataSource
      .getRepository(User)
      .findOne({ where: { email: email.toLowerCase() } });

    if (!user || !user.isActive || user.emailVerifiedAt) return;

    await this.issue(user);
  }

  /**
   * Mints, persists and mails a verification link for a user who is known to need
   * one. Separate from `requestVerification` because the signup path has ALREADY
   * decided the user exists and is unverified — routing it through the silent
   * lookup would re-query for nothing and, worse, would silently send no mail if
   * the branch conditions ever drifted apart.
   *
   * `manager` is optional so a caller creating the user can mint inside its own
   * transaction; the mail is still enqueued after this returns, because
   * `MailService.enqueue` never throws and a rollback cannot unsend a mail.
   */
  async issue(user: User, manager?: EntityManager): Promise<void> {
    const { token, tokenHash } = mintInviteToken();
    const expiresAt = new Date(Date.now() + TTL_HOURS * 3_600_000);

    const write = async (m: EntityManager): Promise<void> => {
      // Invalidate every prior LIVE token first. Without this, re-requesting leaves
      // two working links, and the older one — likely in a mail the user has already
      // decided to ignore, or forwarded to someone — stays a valid credential.
      await m.query(
        `UPDATE email_verification_tokens SET used_at = now(), updated_at = now()
          WHERE user_id = $1 AND used_at IS NULL`,
        [user.id],
      );
      await m.query(
        `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)`,
        [user.id, tokenHash, expiresAt],
      );
    };

    if (manager) await write(manager);
    else await this.dataSource.transaction(write);

    await this.mail.enqueue({
      to: user.email,
      template: MailTemplate.VERIFY_EMAIL,
      params: {
        firstName: user.firstName,
        lastName: user.lastName,
        verifyUrl: this.mail.webUrl(`verify-email/${token}`),
        expiresInHours: TTL_HOURS,
      },
    });
  }

  /**
   * Describes a token without consuming it. NEVER throws.
   *
   * Same rule as `GET /invites/:token/preview` and the reset preview: a 4xx would
   * put the raw token into `AllExceptionsFilter`'s `path` field and from there into
   * the application log, which is the exact exposure hashing the token at rest
   * exists to prevent.
   *
   * `valid` returns a MASKED address so the user can confirm which account they are
   * verifying. Never the role, never the organization — the caller is
   * unauthenticated, and holding a token proves mailbox access and nothing more.
   */
  async preview(token: string): Promise<VerificationPreview> {
    try {
      const row = await this.findByToken(token);
      if (!row) return { status: 'not_found' };
      if (row.usedAt) return { status: 'used' };
      if (row.expiresAt.getTime() <= Date.now()) return { status: 'expired' };

      const user = await this.dataSource.getRepository(User).findOne({ where: { id: row.userId } });
      // A user deleted between mint and preview: CASCADE should have removed the
      // token, so this is belt-and-braces rather than an expected branch.
      if (!user || !user.isActive) return { status: 'not_found' };

      return { status: 'valid', maskedEmail: maskEmail(user.email) };
    } catch (err) {
      this.logger.error(
        `Verification preview failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { status: 'not_found' };
    }
  }

  /**
   * Consumes a token and stamps the address verified. Returns the user so the
   * caller can issue cookies — landing signed in is the point, exactly as it is for
   * a password reset: the alternative bounces someone who has just proved mailbox
   * access to a login form.
   *
   * The conditional `UPDATE ... WHERE used_at IS NULL` plus `affected === 1` is the
   * single-use control. A read-then-write would let two simultaneous clicks of the
   * same link both pass the check, which matters mostly because mail clients
   * pre-fetch links — a scanner and the human can race, and only one should win.
   */
  async verify(token: string): Promise<User> {
    const row = await this.findByToken(token);
    if (!row) throw new InvalidVerificationTokenException('verify_token_invalid');
    if (row.usedAt) throw new InvalidVerificationTokenException('verify_token_used');
    if (row.expiresAt.getTime() <= Date.now()) {
      throw new InvalidVerificationTokenException('verify_token_expired');
    }

    const user = await this.dataSource.getRepository(User).findOne({ where: { id: row.userId } });
    if (!user) throw new InvalidVerificationTokenException('verify_token_invalid');
    if (!user.isActive) {
      // Distinguishable on purpose, mirroring the reset path: the holder has already
      // proven mailbox access, so naming the disabled account reveals nothing they
      // could not learn by trying to sign in — and "nothing happened" would be
      // baffling for someone who just clicked a link they were sent.
      throw new ForbiddenException({
        reason: 'account_disabled',
        message: 'This account is disabled. Contact your administrator.',
      });
    }

    await this.dataSource.transaction(async (manager) => {
      // QueryBuilder, not manager.query: `UPDATE ... RETURNING` through the raw
      // driver returns a [rows, rowCount] TUPLE rather than the rows, so
      // `result.length` is 2 whatever happened and a length check on it is always
      // wrong. The builder exposes `affected` directly. Same shape as the invite
      // consume and the reset consume.
      const result = await manager
        .createQueryBuilder()
        .update(EmailVerificationToken)
        .set({ usedAt: () => 'now()' })
        .where('id = :id AND used_at IS NULL', { id: row.id })
        .execute();
      if (result.affected !== 1) throw new InvalidVerificationTokenException('verify_token_used');

      // Idempotent by construction: re-stamping an already-verified address would be
      // harmless, but the guard keeps the FIRST verification time, which is the one
      // worth knowing.
      await manager.query(
        `UPDATE users SET email_verified_at = now(), updated_at = now()
          WHERE id = $1 AND email_verified_at IS NULL`,
        [user.id],
      );
    });

    // After the transaction — a rollback cannot unsend a mail. Only for OPEN-origin
    // accounts: a closed-ecosystem member already received `welcome` when they
    // accepted their invite, and greeting them again for confirming an address they
    // confirmed by accepting would be a second welcome for one arrival.
    if (user.origin === UserOrigin.OPEN) {
      await this.mail.enqueue({
        to: user.email,
        template: MailTemplate.WELCOME_OPEN,
        params: {
          firstName: user.firstName,
          lastName: user.lastName,
          loginUrl: this.mail.webUrl('login'),
        },
      });
    }

    // Reflect the stamp on the returned instance without a re-read: the caller only
    // needs it to issue tokens and render a response.
    user.emailVerifiedAt ??= new Date();
    return user;
  }

  /** `token_hash` is `select: false`, so it must be asked for explicitly. */
  private findByToken(token: string): Promise<EmailVerificationToken | null> {
    return this.tokens
      .createQueryBuilder('t')
      .addSelect('t.tokenHash')
      .where('t.tokenHash = :hash', { hash: hashToken(token) })
      .getOne();
  }
}

/**
 * Every unusable-token outcome. Distinguished for the VERIFY call (the holder is
 * acting on a link they received, so telling them it expired is helpful and reveals
 * nothing) but never for `preview`, which cannot throw at all.
 */
export class InvalidVerificationTokenException extends ForbiddenException {
  constructor(reason: 'verify_token_invalid' | 'verify_token_used' | 'verify_token_expired') {
    super({
      reason,
      message: 'This verification link is no longer valid. Request a new one.',
    });
  }
}
