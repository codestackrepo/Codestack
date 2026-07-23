import { Column, Entity, JoinColumn, JoinTable, ManyToMany, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { Classroom } from './classroom.entity';

/**
 * A persistent named sub-group of students inside a classroom. Batch
 * membership is always a subset of `classroom.students` (graders are stored
 * separately and are never batch members). Used for assignment targeting —
 * see AssignmentTargetType (docs/REDESIGN.md §5.2).
 */
@Entity('batches')
// Leads with `classroom_id`, so this unique constraint also serves
// single-column classroom lookups — no dedicated index needed (mirrors the
// composite-unique convention used elsewhere).
@Unique('uq_batch_classroom_name', ['classroomId', 'name'])
export class Batch extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @ManyToOne(() => Classroom, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'classroom_id' })
  classroom!: Classroom;

  @Column({ type: 'uuid', name: 'classroom_id' })
  classroomId!: string;

  @ManyToMany(() => User)
  @JoinTable({
    name: 'batch_students',
    joinColumn: { name: 'batch_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'user_id', referencedColumnName: 'id' },
  })
  students!: User[];
}
