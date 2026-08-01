import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { OrgApplicationStatus } from '../../organizations/enums/organization-application.enums';

/**
 * A stranger's request to teach on the OPEN platform (#118).
 *
 * Shape owned by migration 1785640000000; every index and CHECK lives there.
 *
 * NOT `ProfessorRequest`, which sits beside it in this module and models something
 * genuinely different — the two are worth reading together:
 *
 *   ProfessorRequest      an EXISTING member of a tenant asking to be promoted inside
 *                         it. NOT NULL `user_id`, reviewed by that org's ADMIN,
 *                         approval calls `users.setRole`.
 *   ProfessorApplication  someone with NO account asking to join the open platform as
 *                         a professor. No user row exists yet, reviewed by the PLATFORM
 *                         superadmin, approval mints an invite into the community
 *                         tenant which they accept and set a password on.
 *
 * Both survive because both are real. An admin can now invite professors directly, but
 * an invite is addressed to an ADDRESS: an existing same-org member who receives one
 * gets `already_member` with no role change, so promoting someone already inside the
 * tenant still needs the request flow.
 *
 * Reuses `OrgApplicationStatus` rather than declaring a parallel enum — the lifecycle
 * is identical (pending → approved | rejected | withdrawn) and two enums with the same
 * four members is how they drift apart.
 */
@Entity('professor_applications')
export class ProfessorApplication extends BaseEntity {
  @Column({ type: 'varchar', length: 254 })
  email!: string;

  @Column({ type: 'varchar', length: 150, name: 'first_name' })
  firstName!: string;

  @Column({ type: 'varchar', length: 150, name: 'last_name' })
  lastName!: string;

  /**
   * Where they teach, if anywhere. Free text and OPTIONAL — an independent tutor or a
   * bootcamp instructor has no institution, and requiring one would exclude exactly the
   * people the open platform exists for. It is context for the reviewer, never a
   * lookup: naming an institution here does not associate them with a tenant.
   */
  @Column({ type: 'varchar', length: 200, nullable: true })
  institution!: string | null;

  /** The applicant's case for themselves. Untrusted; escaped at render. */
  @Column({ type: 'text', default: '' })
  message!: string;

  @Column({ type: 'varchar', length: 20, default: OrgApplicationStatus.PENDING })
  status!: OrgApplicationStatus;

  @Column({ type: 'uuid', nullable: true, name: 'reviewed_by_id' })
  reviewedById!: string | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'reviewed_at' })
  reviewedAt!: Date | null;

  @Column({ type: 'text', default: '', name: 'decision_reason' })
  decisionReason!: string;

  /**
   * The invite approval produced. ON DELETE SET NULL — an invite that expires and is
   * cleaned up must not delete the record that this was ever approved.
   */
  @Column({ type: 'uuid', nullable: true, name: 'invite_id' })
  inviteId!: string | null;
}
