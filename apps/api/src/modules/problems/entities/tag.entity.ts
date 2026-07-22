import { Column, Entity, Index, ManyToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Problem } from './problem.entity';

@Entity('tags')
export class Tag extends BaseEntity {
  @Index('idx_tag_name', { unique: true })
  @Column({ type: 'varchar', length: 64, unique: true })
  name!: string;

  @ManyToMany(() => Problem, (problem) => problem.tags)
  problems!: Problem[];
}
