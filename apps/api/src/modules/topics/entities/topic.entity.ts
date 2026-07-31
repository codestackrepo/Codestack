import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

/**
 * A discussion topic (#76). Shape owned by migration 1785570000000; the indexes
 * live there because one is partial (`WHERE organization_id IS NULL`) and both are
 * DESC-ordered, neither of which a column-level `@Index` can express.
 */
@Entity('topics')
export class Topic extends BaseEntity {
  /**
   * NULL means GLOBAL — a platform topic every tenant can see, authored by a
   * SuperAdmin. Non-null means the topic belongs to that one organization.
   *
   * Note the asymmetry with `TopicComment.organizationId`, which is NOT NULL: a
   * global topic is shared, but its comments never are.
   */
  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId!: string | null;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text', default: '' })
  description!: string;

  /**
   * Nullable: the FK is `ON DELETE SET NULL`, matching `problems.created_by_id`. A
   * topic outlives its author and keeps its discussion; only the attribution goes.
   */
  @Column({ type: 'uuid', name: 'created_by_id', nullable: true })
  createdById!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by_id' })
  createdBy?: User;

  /** No new comments while locked. Existing ones stay readable. */
  @Column({ type: 'boolean', name: 'is_locked', default: false })
  isLocked!: boolean;
}
