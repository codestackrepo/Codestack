import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { OrganizationStatus, OrganizationType } from '../enums/organization.enums';

/**
 * The tenant root (a university/organization). Every `organization_id` FK across
 * the data model points here. SuperAdmin is the only role with no org.
 *
 * Numeric quotas and usage counters deliberately do NOT live here — per-org
 * quotas are a separate sparse `org_quotas` table owned by the quotas subsystem
 * (#66), so absent = unlimited without column churn on this table.
 */
@Entity('organizations')
export class Organization extends BaseEntity {
  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Index('uq_organizations_slug', { unique: true })
  @Column({ type: 'varchar', length: 80 })
  slug!: string;

  @Column({ type: 'varchar', length: 20, default: OrganizationType.UNIVERSITY })
  type!: OrganizationType;

  @Column({ type: 'varchar', length: 20, default: OrganizationStatus.ACTIVE })
  status!: OrganizationStatus;

  // 1:1 mirror to a Clerk Organization. Nullable so a local org can exist before
  // its Clerk org is provisioned (Clerk integration, #51). Unique-when-present
  // (partial index owned by the migration).
  @Column({ type: 'varchar', length: 120, name: 'clerk_org_id', nullable: true })
  clerkOrgId!: string | null;

  // Per-org branding / default timezone / feature flags.
  @Column({ type: 'jsonb', default: {} })
  settings!: Record<string, unknown>;

  // The SuperAdmin who created the org (null for the seeded legacy org).
  @Column({ type: 'uuid', name: 'created_by_id', nullable: true })
  createdById!: string | null;
}
