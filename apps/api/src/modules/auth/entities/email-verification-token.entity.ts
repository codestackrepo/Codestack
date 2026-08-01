import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * A single-use email-verification credential. Shape owned by migration
 * 1785590000000; every index and CHECK is declared there and nowhere here.
 *
 * Deliberately mirrors `password_reset_tokens` column for column — same 64-hex
 * hash, same `select: false`, same "the plaintext exists only in the mail"
 * contract. The two services that consume these tables are near-identical by
 * design, and keeping the tables structurally identical is what stops one from
 * quietly acquiring a weaker guarantee than the other.
 *
 * The only real difference is the TTL, and it sits between the other two on
 * purpose: a reset link lives 60 minutes because the user is acting *right now*,
 * an invite lives 14 days because the recipient may act eventually, and a signup
 * verification lives 24 hours because someone who just typed their address will
 * come back soon but not necessarily this minute.
 */
@Entity('email_verification_tokens')
export class EmailVerificationToken extends BaseEntity {
  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  /**
   * sha256 of the raw token, 64 lowercase hex (CHECK-enforced).
   *
   * `select: false` for the same reason it is on `org_invites.token_hash` and
   * `password_reset_tokens.token_hash`: the hash is the one value that could turn a
   * stray entity log into an offline target. Lookups must `addSelect` it explicitly.
   */
  @Column({ type: 'varchar', length: 64, name: 'token_hash', select: false })
  tokenHash!: string;

  /** 24 hours from mint — see the class comment for why it sits where it does. */
  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt!: Date;

  /**
   * Set by the conditional UPDATE that consumes the token, and by the sweep that
   * invalidates prior live tokens when a new one is minted. NULL means live.
   */
  @Column({ type: 'timestamptz', name: 'used_at', nullable: true })
  usedAt!: Date | null;
}
