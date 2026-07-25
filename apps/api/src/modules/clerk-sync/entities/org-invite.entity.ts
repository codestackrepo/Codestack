import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Role } from '../../../common/enums/role.enum';
import { OrgInviteStatus } from '../enums/org-invite.enums';

/**
 * Local mirror of a Clerk Organization Invitation (#52). Clerk is authoritative;
 * this row is synced by the webhook and read only for quota seat-counting (#65/
 * #66) — "active users + pending non-expired invites" — so seat math never makes
 * a live Clerk call. Idempotent upserts key on `clerkInvitationId`.
 */
@Entity('org_invites')
export class OrgInvite extends BaseEntity {
  // Partial index — seat-counting only ever scans pending invites (matches the
  // migration's idx_org_invites_org_pending).
  @Index('idx_org_invites_org_pending', { where: "status = 'pending'" })
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;

  @Index('uq_org_invites_clerk_invitation', { unique: true })
  @Column({ type: 'varchar', length: 120, name: 'clerk_invitation_id' })
  clerkInvitationId!: string;

  @Column({ type: 'varchar', length: 254 })
  email!: string;

  // The role the invitee will hold once they accept (from the invite metadata).
  @Column({ type: 'varchar', length: 20, default: Role.STUDENT })
  role!: Role;

  @Column({ type: 'varchar', length: 20, default: OrgInviteStatus.PENDING })
  status!: OrgInviteStatus;
}
