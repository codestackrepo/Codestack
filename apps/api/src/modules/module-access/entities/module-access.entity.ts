import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Role } from '../../../common/enums/role.enum';
import { AppModuleKey } from '../enums/app-module-key.enum';

/**
 * Sparse override rows for the Module × Role access matrix. A row exists only
 * for a cell that differs from (or has been explicitly set relative to)
 * MODULE_ACCESS_DEFAULTS. The unique index guarantees one row per
 * (module_key, role). `role` is varchar + CHECK (not a PG enum) to avoid future
 * ALTER TYPE churn, matching the notifications-to-varchar precedent.
 */
@Index('uq_module_access_key_role', ['moduleKey', 'role'], { unique: true })
@Entity('module_access')
export class ModuleAccess extends BaseEntity {
  @Column({ type: 'varchar', length: 50, name: 'module_key' })
  moduleKey!: AppModuleKey;

  @Column({ type: 'varchar', length: 20 })
  role!: Role;

  @Column({ type: 'boolean' })
  enabled!: boolean;
}
