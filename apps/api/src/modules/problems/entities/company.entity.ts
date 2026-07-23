import { Column, Entity, Index, ManyToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Problem } from './problem.entity';

/**
 * A company a problem is associated with (LeetCode-style "asked at" tags), used
 * as a catalog facet alongside topic tags. Mirrors the Tag entity's shape; the
 * owning side of the M2M is Problem (`problem_companies` join table).
 */
@Entity('companies')
export class Company extends BaseEntity {
  @Index('idx_company_name', { unique: true })
  @Column({ type: 'varchar', length: 80, unique: true })
  name!: string;

  @ManyToMany(() => Problem, (problem) => problem.companies)
  problems!: Problem[];
}
