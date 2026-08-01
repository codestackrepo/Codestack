import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Role } from '../../../common/enums/role.enum';
import { UserOrigin } from '../../../common/enums/user-origin.enum';

@Entity('users')
export class User extends BaseEntity {
  @Index('idx_user_email', { unique: true })
  @Column({ type: 'varchar', length: 254, unique: true })
  email!: string;

  @Column({ type: 'varchar', length: 150, name: 'first_name' })
  firstName!: string;

  @Column({ type: 'varchar', length: 150, name: 'last_name' })
  lastName!: string;

  // Never selected by default — must be explicitly requested for auth.
  // Nullable because an invited account exists before it has a password: the
  // invitee sets one at acceptance.
  @Column({ type: 'varchar', length: 255, name: 'password_hash', select: false, nullable: true })
  passwordHash!: string | null;

  @Index('idx_user_role')
  @Column({ type: 'varchar', length: 20, default: Role.STUDENT })
  role!: Role;

  // Tenant FK. NULL for a SUPERADMIN (always) and for a self-registered STUDENT
  // who has not yet been assigned or claimed an invite — those are the only two
  // legal cases, DB-enforced by chk_users_org_required's CASE form
  // (1785520000000). An org-less student is confined to the holding state.
  @Index('idx_user_organization')
  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId!: string | null;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive!: boolean;

  /**
   * How this account came into existence. IMMUTABLE after creation (#118).
   *
   * Provenance, not current state — see `UserOrigin`. The ecosystem a user is in
   * right now is answered by `organizationId` (and that org's `type`); this answers
   * only how they arrived, and nothing may rewrite it. An open student who accepts a
   * university invite renders as a member of that university while staying
   * `origin = 'open'` forever, because that is the truth about how they got here.
   *
   * DB-enforced by `chk_users_origin` (1785600000000).
   */
  @Column({ type: 'varchar', length: 20, default: UserOrigin.CLOSED })
  origin!: UserOrigin;

  /**
   * When this address was proven readable by its owner. NULL means never (#118).
   *
   * A stamp rather than a boolean, because "when" is the question support actually
   * asks and a boolean cannot answer it.
   *
   * Written by exactly four places in the running code, each of which either proves
   * mailbox access or is a deliberate vouch: consuming a verification token, completing
   * a password reset (both = a mailed link came back), staff creation inside a tenant
   * (the acting admin vouches), and invite acceptance (the invite token came back).
   * Migration 1785590000000 additionally grandfathered every pre-existing row, which is
   * a one-off rather than a writer. `check-invariants` pins the count at four.
   *
   * The one path that deliberately leaves it NULL is `createOpenSelfSignup` — nobody
   * vouched for a self-signup address, which is the whole reason verification exists.
   *
   * `AuthService.validateCredentials` refuses a password login while this is NULL,
   * so it is a real gate and not decoration.
   */
  @Column({ type: 'timestamptz', nullable: true, name: 'email_verified_at' })
  emailVerifiedAt!: Date | null;

  @Column({ type: 'boolean', default: false, name: 'is_staff' })
  isStaff!: boolean;

  @Column({ type: 'timestamptz', nullable: true, name: 'last_login_at' })
  lastLoginAt!: Date | null;

  // Canonical per-user IANA timezone (gamification streak/local-day math, §5.6).
  // Owned by the gamification migration; UserGamification.timezone is a denorm copy.
  @Column({ type: 'varchar', length: 64, default: 'UTC' })
  timezone!: string;

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`.trim();
  }
}
