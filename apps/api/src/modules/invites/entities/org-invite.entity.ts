import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Role } from '../../../common/enums/role.enum';
import { OrgInviteKind, OrgInviteSource, OrgInviteStatus } from '../enums/org-invite.enums';

/**
 * A first-party organization invite. Shape owned by migration 1785530000000,
 * which reshaped this table out of the retired third-party invitation mirror.
 *
 * Every index and CHECK is declared in that migration and NOWHERE here. The
 * table's access paths are a composite partial index, a functional unique index on
 * `lower(email)` and a plain unique index — none of which a column-level `@Index`
 * can express, so a decorator would either understate the real index or
 * (under `synchronize`, which this project never enables) fight it.
 */
@Entity('org_invites')
export class OrgInvite extends BaseEntity {
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;

  /**
   * sha-256 of the raw token, 64 lowercase hex (CHECK-enforced).
   *
   * `select: false` is load-bearing, not defensive: the raw token exists only as a
   * local variable, a mail body, a URL and a request body, and the hash is the one
   * thing that could turn a stray log of an entity into an offline guessing target
   * for the token space. Lookups must `addSelect` it explicitly.
   */
  @Column({ type: 'varchar', length: 64, name: 'token_hash', select: false })
  tokenHash!: string;

  @Column({ type: 'varchar', length: 254 })
  email!: string;

  /** The role the invitee holds once they accept. `superadmin` is never invitable. */
  @Column({ type: 'varchar', length: 20, default: Role.STUDENT })
  role!: Role;

  @Column({ type: 'varchar', length: 20, default: OrgInviteStatus.PENDING })
  status!: OrgInviteStatus;

  @Column({ type: 'varchar', length: 20, default: OrgInviteKind.NEW_ACCOUNT })
  kind!: OrgInviteKind;

  @Column({ type: 'varchar', length: 20, default: OrgInviteSource.MANUAL })
  source!: OrgInviteSource;

  /** NOT NULL in the DB — an invite with no TTL would hold a seat forever. */
  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', name: 'accepted_at', nullable: true })
  acceptedAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'revoked_at', nullable: true })
  revokedAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'last_sent_at', nullable: true })
  lastSentAt!: Date | null;

  /** Incremented by resend, which also rotates `tokenHash` (the old link dies). */
  @Column({ type: 'int', name: 'send_count', default: 0 })
  sendCount!: number;

  @Column({ type: 'varchar', length: 150, name: 'first_name', nullable: true })
  firstName!: string | null;

  @Column({ type: 'varchar', length: 150, name: 'last_name', nullable: true })
  lastName!: string | null;

  /** FK to users, ON DELETE SET NULL — deleting the sender must not release the seat. */
  @Column({ type: 'uuid', name: 'invited_by_id', nullable: true })
  invitedById!: string | null;

  /** Groups one roster upload's invites; NULL for a manual single invite. */
  @Column({ type: 'uuid', name: 'batch_id', nullable: true })
  batchId!: string | null;
}
