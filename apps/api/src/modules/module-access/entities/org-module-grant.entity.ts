import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Role } from '../../../common/enums/role.enum';

/** Per-role starting point for one org, jsonb so adding a role needs no DDL. */
export type RoleDefaults = Partial<Record<Role, boolean>>;

/**
 * The SuperAdmin's per-org cap on a module or dotted feature (#64, §5.5).
 *
 * SPARSE and absent-means-granted: an org with no row for a key has that key
 * granted, so the table stays empty for a normal tenant.
 *
 * `granted = false` is a HARD FALSE for the whole org INCLUDING its admin — the
 * only layer that outranks the org-admin self-lock immunity, and therefore the
 * one that makes "this tenant did not buy this" enforceable. `roleDefaults` is
 * the opposite end: the weakest layer that still beats the code DEFAULTS, a
 * per-org baseline the org-admin can override per role.
 */
@Index('uq_org_module_grant_org_feature', ['organizationId', 'featureKey'], { unique: true })
@Entity('org_module_grant')
export class OrgModuleGrant extends BaseEntity {
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;

  /** A module key (`problems`) or a dotted feature key (`problems.author`). */
  @Column({ type: 'varchar', length: 80, name: 'feature_key' })
  featureKey!: string;

  @Column({ type: 'boolean', default: true })
  granted!: boolean;

  @Column({ type: 'jsonb', nullable: true, name: 'role_defaults' })
  roleDefaults!: RoleDefaults | null;
}
