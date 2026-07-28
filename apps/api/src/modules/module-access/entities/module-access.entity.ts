import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Role } from '../../../common/enums/role.enum';

/**
 * Sparse override rows for the access matrix. A row exists only for a cell that
 * has been explicitly set relative to the code DEFAULTS. `role` is varchar +
 * CHECK (not a PG enum) to avoid future ALTER TYPE churn, matching the
 * notifications-to-varchar precedent.
 *
 * TWO LAYERS in one table, discriminated by `orgId` (#64, §5.5):
 *   - `orgId === null` -> the PLATFORM layer, owned by SuperAdmin.
 *   - `orgId` set      -> that ORG's layer, owned by its admin, and it wins.
 *
 * Uniqueness is enforced by two PARTIAL indexes owned by the migration. Only the
 * org-layer one is mirrored here: a composite unique over a nullable `org_id`
 * would NOT dedupe the platform layer (NULLs never collide in Postgres), so the
 * `WHERE org_id IS NULL` index has no faithful decorator form and lives solely in
 * the migration.
 *
 * `moduleKey` is a plain string, not AppModuleKey — it also holds dotted feature
 * keys (`problems.author`), whose namespace is FeatureKey.
 */
@Index('uq_module_access_org', ['orgId', 'moduleKey', 'role'], {
  unique: true,
  where: '"org_id" IS NOT NULL',
})
@Entity('module_access')
export class ModuleAccess extends BaseEntity {
  @Column({ type: 'varchar', length: 80, name: 'module_key' })
  moduleKey!: string;

  @Column({ type: 'varchar', length: 20 })
  role!: Role;

  @Column({ type: 'boolean' })
  enabled!: boolean;

  /** NULL = the platform-wide layer; set = an override scoped to that org. */
  @Index('idx_module_access_org', { where: '"org_id" IS NOT NULL' })
  @Column({ type: 'uuid', name: 'org_id', nullable: true })
  orgId!: string | null;
}
