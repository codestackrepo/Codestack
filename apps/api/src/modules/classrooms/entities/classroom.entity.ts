import { Column, Entity, Index, JoinColumn, JoinTable, ManyToMany, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

// course_id / title are unique WITHIN an org (not globally) so two universities
// can each own a "CS101". Composite uniques replace the former global ones (#55).
@Index('uq_classroom_org_course', ['organizationId', 'courseId'], { unique: true })
@Index('uq_classroom_org_title', ['organizationId', 'title'], { unique: true })
@Entity('classrooms')
export class Classroom extends BaseEntity {
  // Tenant FK (direct column — classrooms always belong to an org).
  @Index('idx_classroom_organization')
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;

  @Column({ type: 'varchar', length: 255, name: 'course_id' })
  courseId!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', default: '' })
  description!: string;

  @Column({ type: 'varchar', length: 50, default: 'Spring 2024' })
  term!: string;

  @Column({ type: 'timestamptz', name: 'start_date' })
  startDate!: Date;

  @Column({ type: 'timestamptz', name: 'end_date' })
  endDate!: Date;

  // Denormalized member counter (students + graders + professor).
  @Column({ type: 'int', default: 0, name: 'total_users' })
  totalUsers!: number;

  @Index('idx_classroom_created_by')
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy!: User;

  @Column({ type: 'uuid', name: 'created_by_id' })
  createdById!: string;

  @Index('idx_classroom_professor')
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'professor_id' })
  professor!: User | null;

  @Column({ type: 'uuid', nullable: true, name: 'professor_id' })
  professorId!: string | null;

  @ManyToMany(() => User)
  @JoinTable({
    name: 'classroom_students',
    joinColumn: { name: 'classroom_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'user_id', referencedColumnName: 'id' },
  })
  students!: User[];

  // Graders are role=student users granted grading rights in this classroom.
  @ManyToMany(() => User)
  @JoinTable({
    name: 'classroom_graders',
    joinColumn: { name: 'classroom_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'user_id', referencedColumnName: 'id' },
  })
  graders!: User[];
}
