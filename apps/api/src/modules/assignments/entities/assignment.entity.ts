import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Classroom } from '../../classrooms/entities/classroom.entity';
import { User } from '../../users/entities/user.entity';
import { AssignmentStatus } from '../enums/assignment-status.enum';
import { AssignmentProblem } from './assignment-problem.entity';

@Entity('assignments')
@Index('idx_assignment_classroom_status', ['classroomId', 'status'])
export class Assignment extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', default: '' })
  description!: string;

  @Column({ type: 'timestamptz', name: 'start_date' })
  startDate!: Date;

  @Column({ type: 'timestamptz', name: 'end_date' })
  endDate!: Date;

  @Index('idx_assignment_classroom')
  @ManyToOne(() => Classroom, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'classroom_id' })
  classroom!: Classroom;

  @Column({ type: 'uuid', name: 'classroom_id' })
  classroomId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy!: User;

  @Column({ type: 'uuid', name: 'created_by_id' })
  createdById!: string;

  @Index('idx_assignment_status')
  @Column({ type: 'enum', enum: AssignmentStatus, default: AssignmentStatus.SCHEDULED })
  status!: AssignmentStatus;

  @Column({ type: 'timestamptz', nullable: true, name: 'published_at' })
  publishedAt!: Date | null;

  @OneToMany(() => AssignmentProblem, (ap) => ap.assignment)
  assignmentProblems!: AssignmentProblem[];

  /**
   * Time-based status transitions (mirrors the original state machine).
   * Returns true if the status changed. Manual states (draft/grade_published)
   * are never auto-transitioned.
   */
  applyTimeTransition(now: Date): boolean {
    if (
      this.status === AssignmentStatus.DRAFT ||
      this.status === AssignmentStatus.GRADE_PUBLISHED
    ) {
      return false;
    }
    if (this.status === AssignmentStatus.SCHEDULED && this.startDate <= now && now < this.endDate) {
      this.status = AssignmentStatus.ACTIVE;
      return true;
    }
    if (this.status === AssignmentStatus.ACTIVE && now >= this.endDate) {
      this.status = AssignmentStatus.COMPLETED;
      return true;
    }
    return false;
  }
}
