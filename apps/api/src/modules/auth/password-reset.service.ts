import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { DataSource, Repository } from 'typeorm';
import { MailService } from '../mail/mail.service';
import { MailTemplate } from '../mail/mail.types';
import { hashToken, mintInviteToken } from '../invites/invite-token.util';
import { User } from '../users/entities/user.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';

/** Short on purpose: the recipient is acting right now, unlike an invitee. */
const TTL_MINUTES = 60;

export type ResetTokenStatus = 'valid' | 'expired' | 'used' | 'not_found';

export interface ResetPreview {
  status: ResetTokenStatus;
  /** Present ONLY for `valid`. Masked — enough to recognise, not enough to harvest. */
  maskedEmail?: string;
}

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    @InjectRepository(PasswordResetToken)
    private readonly tokens: Repository<PasswordResetToken>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly mail: MailService,
  ) {}

  /**
   * Mints a reset token and mails it — or silently does nothing.
   *
   * The CALLER always answers 200 with an identical body. Every branch here is
   * chosen so that the observable behaviour of a known and an unknown address is
   * the same: no status difference, no message difference, and no early return
   * that would make the unknown case measurably faster in a way worth probing.
   * `users.email` is globally unique, so a positive answer would be a definite
   * "this person has an account here" — an enumeration oracle against a login
   * page that is already public.
   *
   * Three cases produce no mail and no row: no such address, a disabled account,
   * and an account with no password hash (an invite that was never accepted —
   * those recover by accepting the invite, not by resetting a password that does
   * not exist).
   */
  async requestReset(email: string): Promise<void> {
    const user = await this.dataSource
      .getRepository(User)
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :email', { email: email.toLowerCase() })
      .getOne();

    if (!user || !user.isActive || !user.passwordHash) return;

    const { token, tokenHash } = mintInviteToken();
    const expiresAt = new Date(Date.now() + TTL_MINUTES * 60_000);

    await this.dataSource.transaction(async (manager) => {
      // Invalidate every prior LIVE token first. Without this, requesting twice
      // leaves two working links, and the older one — likely in a mail the user
      // has already decided to ignore — stays a valid credential.
      await manager.query(
        `UPDATE password_reset_tokens SET used_at = now(), updated_at = now()
          WHERE user_id = $1 AND used_at IS NULL`,
        [user.id],
      );
      await manager.query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)`,
        [user.id, tokenHash, expiresAt],
      );
    });

    // After the transaction — a rollback cannot unsend a mail.
    await this.mail.enqueue({
      to: user.email,
      template: MailTemplate.PASSWORD_RESET,
      params: {
        firstName: user.firstName,
        lastName: user.lastName,
        resetUrl: this.mail.webUrl(`reset-password/${token}`),
        expiresInMinutes: TTL_MINUTES,
      },
    });
  }

  /**
   * Describes a token without consuming it. NEVER throws.
   *
   * Same rule as `GET /invites/:token/preview`: a 4xx would put the raw token
   * into `AllExceptionsFilter`'s `path` field and from there into the application
   * log, which is the exact exposure hashing the token at rest exists to prevent.
   *
   * `valid` returns a MASKED address so the user can confirm which account they
   * are resetting. Never the role, never the organization — the caller is
   * unauthenticated and holding a token is not proof of anything beyond mailbox
   * access.
   */
  async preview(token: string): Promise<ResetPreview> {
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
        `Reset preview failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { status: 'not_found' };
    }
  }

  /**
   * Consumes a token and sets the new password. Returns the user so the caller
   * can issue cookies.
   *
   * The conditional `UPDATE ... WHERE used_at IS NULL` plus `affected === 1` is
   * the single-use control, exactly as the invite consume is. A read-then-write
   * would let two simultaneous submissions of the same link both pass the check
   * and both set a password — the second silently overwriting the first, which
   * matters when one of them is an attacker replaying an intercepted link.
   */
  async resetPassword(token: string, newPassword: string): Promise<User> {
    const row = await this.findByToken(token);
    if (!row) throw new InvalidResetTokenException('reset_token_invalid');
    if (row.usedAt) throw new InvalidResetTokenException('reset_token_used');
    if (row.expiresAt.getTime() <= Date.now()) {
      throw new InvalidResetTokenException('reset_token_expired');
    }

    const user = await this.dataSource.getRepository(User).findOne({ where: { id: row.userId } });
    if (!user) throw new InvalidResetTokenException('reset_token_invalid');
    if (!user.isActive) {
      // Distinguishable on purpose: the holder has already proven mailbox access,
      // so telling them the account is disabled reveals nothing they could not
      // learn by trying to sign in, and "nothing happened" would be baffling.
      throw new ForbiddenException({
        reason: 'account_disabled',
        message: 'This account is disabled. Contact your administrator.',
      });
    }

    // Hashed BEFORE the transaction: argon2 is ~100ms, and holding a row lock
    // across it serialises concurrent resets on the slowest possible step.
    const passwordHash = await argon2.hash(newPassword);

    await this.dataSource.transaction(async (manager) => {
      // QueryBuilder, not manager.query: `UPDATE ... RETURNING` through the raw
      // driver returns a [rows, rowCount] TUPLE, not the rows — so `result.length`
      // is 2 whatever happened, and a length check on it is always wrong. The
      // builder exposes `affected` directly, and this is the same shape #104's
      // invite consume uses.
      const result = await manager
        .createQueryBuilder()
        .update(PasswordResetToken)
        .set({ usedAt: () => 'now()' })
        .where('id = :id AND used_at IS NULL', { id: row.id })
        .execute();
      if (result.affected !== 1) throw new InvalidResetTokenException('reset_token_used');

      await manager.query(`UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`, [
        passwordHash,
        user.id,
      ]);
    });

    return user;
  }

  /** `token_hash` is `select: false`, so it must be asked for explicitly. */
  private findByToken(token: string): Promise<PasswordResetToken | null> {
    return this.tokens
      .createQueryBuilder('t')
      .addSelect('t.tokenHash')
      .where('t.tokenHash = :hash', { hash: hashToken(token) })
      .getOne();
  }
}

/**
 * Every unusable-token outcome. Distinguished for the RESET call (the holder is
 * already acting on a link they received, so telling them it expired is helpful
 * and reveals nothing) but never for `preview`, which cannot throw at all.
 */
export class InvalidResetTokenException extends ForbiddenException {
  constructor(reason: 'reset_token_invalid' | 'reset_token_used' | 'reset_token_expired') {
    super({
      reason,
      message: 'This password reset link is no longer valid. Request a new one.',
    });
  }
}

/**
 * `ada.lovelace@example.edu` -> `ad••••••••@example.edu`.
 *
 * Enough for the user to recognise their own address; not enough to be worth
 * harvesting from a token someone else's link leaked.
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '•••';
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}${'•'.repeat(Math.max(3, local.length - head.length))}@${domain}`;
}
