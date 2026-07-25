import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Role } from '../../../common/enums/role.enum';

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
  // Nullable: Clerk-managed accounts (dual-auth #51) have no local password.
  @Column({ type: 'varchar', length: 255, name: 'password_hash', select: false, nullable: true })
  passwordHash!: string | null;

  // Clerk identity (#51). Partial-unique so the many JWT-only NULL rows never
  // collide (index owned by migration 1785460000000).
  @Index('idx_user_clerk_user_id', { unique: true, where: '"clerk_user_id" IS NOT NULL' })
  @Column({ type: 'varchar', length: 255, name: 'clerk_user_id', nullable: true })
  clerkUserId!: string | null;

  @Index('idx_user_role')
  @Column({ type: 'varchar', length: 20, default: Role.STUDENT })
  role!: Role;

  // Tenant FK. NULL only for SUPERADMIN (DB-enforced by chk_users_org_required).
  @Index('idx_user_organization')
  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId!: string | null;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive!: boolean;

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
