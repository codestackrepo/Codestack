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
  @Column({ type: 'varchar', length: 255, name: 'password_hash', select: false })
  passwordHash!: string;

  @Index('idx_user_role')
  @Column({ type: 'enum', enum: Role, default: Role.STUDENT })
  role!: Role;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive!: boolean;

  @Column({ type: 'boolean', default: false, name: 'is_staff' })
  isStaff!: boolean;

  @Column({ type: 'timestamptz', nullable: true, name: 'last_login_at' })
  lastLoginAt!: Date | null;

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`.trim();
  }
}
