import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { InviteStatus } from '../enums/onboarding.enums';

/**
 * An admin-minted invitation that lets its holder register as a professor.
 * The `token` is the bearer secret embedded in the invite link; a registrant
 * passes it at sign-up to be granted the professor role (see AuthService).
 * `email`, when set, is advisory (pre-fills the register form) — the token,
 * not the email, is what authorizes the elevation.
 */
@Entity('professor_invites')
export class ProfessorInvite extends BaseEntity {
  @Index('idx_prof_invite_token', { unique: true })
  @Column({ type: 'varchar', length: 64, unique: true })
  token!: string;

  @Column({ type: 'varchar', length: 254, nullable: true })
  email!: string | null;

  @Index('idx_prof_invite_status')
  @Column({ type: 'varchar', length: 20, default: InviteStatus.PENDING })
  status!: InviteStatus;

  @Index('idx_prof_invite_invited_by')
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'invited_by_id' })
  invitedBy!: User | null;

  @Column({ type: 'uuid', nullable: true, name: 'invited_by_id' })
  invitedById!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'consumed_by_id' })
  consumedBy!: User | null;

  @Column({ type: 'uuid', nullable: true, name: 'consumed_by_id' })
  consumedById!: string | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'expires_at' })
  expiresAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'consumed_at' })
  consumedAt!: Date | null;
}
