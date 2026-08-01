import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { OrgApplicationStatus } from '../enums/organization-application.enums';
import { OrganizationType } from '../enums/organization.enums';

/**
 * An institution's request to be given a tenant on CodeStack (#118).
 *
 * Shape owned by migration 1785630000000; every index and CHECK is declared there and
 * nowhere here — the partial-functional unique index on `lower(contact_email) WHERE
 * status = 'pending'` cannot be expressed by a column decorator, so a decorator would
 * either understate the real constraint or fight it.
 *
 * PRE-TENANT AND PRE-ACCOUNT. At submission neither the organization nor the contact's
 * user account exists, so this entity holds no required relation to either. That is
 * precisely what makes it a different thing from `professor_requests`, which needs an
 * existing `user_id` because it models a member of a tenant asking to be promoted
 * inside it. Three request-shaped tables exist for three genuinely different shapes;
 * collapsing them behind one discriminator would make every FK nullable and every
 * query conditional.
 */
@Entity('organization_applications')
export class OrganizationApplication extends BaseEntity {
  @Column({ type: 'varchar', length: 200, name: 'organization_name' })
  organizationName!: string;

  /**
   * Never `community`. Nobody applies to create the platform's own open tenant, and
   * permitting it would let an approval mint a second one — DB-enforced by
   * `chk_org_application_type`, which is deliberately narrower than
   * `chk_organizations_type`.
   */
  @Column({
    type: 'varchar',
    length: 20,
    name: 'organization_type',
    default: OrganizationType.UNIVERSITY,
  })
  organizationType!: OrganizationType;

  @Column({ type: 'varchar', length: 255, nullable: true })
  website!: string | null;

  @Column({ type: 'varchar', length: 150, name: 'contact_name' })
  contactName!: string;

  /**
   * The person who filled in the form. NOT necessarily the intended admin — a
   * procurement officer or a head of department may apply on behalf of a colleague —
   * which is why the approval dialog prefills the admin address from this but lets the
   * superadmin change it.
   */
  @Column({ type: 'varchar', length: 254, name: 'contact_email' })
  contactEmail!: string;

  /** Free text from the applicant. Untrusted; escaped at render, never at write. */
  @Column({ type: 'text', default: '' })
  message!: string;

  @Column({ type: 'varchar', length: 20, default: OrgApplicationStatus.PENDING })
  status!: OrgApplicationStatus;

  /** FK to users, ON DELETE SET NULL — deleting the reviewer must not delete the decision. */
  @Column({ type: 'uuid', nullable: true, name: 'reviewed_by_id' })
  reviewedById!: string | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'reviewed_at' })
  reviewedAt!: Date | null;

  /** Superadmin-authored, shown to the applicant on rejection. Escaped at render. */
  @Column({ type: 'text', default: '', name: 'decision_reason' })
  decisionReason!: string;

  /**
   * The tenant this application produced. NULL until approval — the audit link, not a
   * dependency: the row is complete and meaningful without it.
   */
  @Column({ type: 'uuid', nullable: true, name: 'organization_id' })
  organizationId!: string | null;
}
