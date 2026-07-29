import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { QuotaResource } from '../enums/quota-resource.enum';

/**
 * One numeric limit for one org (#66, §5.4). SPARSE: a row exists only for a
 * resource a SuperAdmin has actually capped, so an unlimited org has no rows.
 *
 * `limitValue` is nullable and the distinction matters:
 *   - `null` (or no row at all) => UNLIMITED
 *   - `0`                       => fully BLOCKED
 * Never coalesce one into the other; every read tests `=== null` explicitly.
 */
@Index('uq_org_quotas_org_resource', ['organizationId', 'resource'], { unique: true })
@Entity('org_quotas')
export class OrgQuota extends BaseEntity {
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;

  @Column({ type: 'varchar', length: 40 })
  resource!: QuotaResource;

  @Column({ type: 'int', name: 'limit_value', nullable: true })
  limitValue!: number | null;
}
