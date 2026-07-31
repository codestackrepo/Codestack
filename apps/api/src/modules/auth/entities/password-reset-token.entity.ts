import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * A single-use password-reset credential. Shape owned by migration
 * 1785550000000; every index and CHECK is declared there and nowhere here.
 *
 * Deliberately mirrors `org_invites`' token columns — same 64-hex hash, same
 * `select: false`, same "the plaintext exists only in the mail" contract — so the
 * two recovery-adjacent tables cannot drift apart in how carefully they treat a
 * bearer credential.
 */
@Entity('password_reset_tokens')
export class PasswordResetToken extends BaseEntity {
  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  /**
   * sha256 of the raw token, 64 lowercase hex (CHECK-enforced).
   *
   * `select: false` for the same reason it is on `org_invites.token_hash`: the
   * hash is the one value that could turn a stray entity log into an offline
   * target. Lookups must `addSelect` it explicitly.
   */
  @Column({ type: 'varchar', length: 64, name: 'token_hash', select: false })
  tokenHash!: string;

  /** 60 minutes from mint — shorter than an invite, because the user is acting now. */
  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt!: Date;

  /**
   * Set by the conditional UPDATE that consumes the token, and by the sweep that
   * invalidates prior live tokens when a new one is minted. NULL means live.
   */
  @Column({ type: 'timestamptz', name: 'used_at', nullable: true })
  usedAt!: Date | null;
}
