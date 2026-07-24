import {
  Column,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Batch } from '../../classrooms/entities/batch.entity';
import { Classroom } from '../../classrooms/entities/classroom.entity';
import { User } from '../../users/entities/user.entity';
import { AssignmentKind } from '../enums/assignment-kind.enum';
import { AssignmentStatus } from '../enums/assignment-status.enum';
import { AssignmentTargetType } from '../enums/assignment-target-type.enum';
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

  // Denormalized tenant FK — always equals the assignment's classroom org (#58).
  @Index('idx_assignment_organization')
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;

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

  // ---- Kind + targeting (issue #17) ----
  // A "test" reuses this entity + state machine; `durationMinutes` drives the
  // server-authoritative attempt deadline. Targeting decides student
  // visibility: whole classroom vs. specific batches (§5.2).
  @Column({ type: 'enum', enum: AssignmentKind, default: AssignmentKind.ASSIGNMENT })
  kind!: AssignmentKind;

  @Column({
    type: 'enum',
    enum: AssignmentTargetType,
    default: AssignmentTargetType.CLASSROOM,
    name: 'target_type',
  })
  targetType!: AssignmentTargetType;

  @Column({ type: 'int', nullable: true, name: 'duration_minutes' })
  durationMinutes!: number | null;

  @ManyToMany(() => Batch)
  @JoinTable({
    name: 'assignment_target_batches',
    joinColumn: { name: 'assignment_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'batch_id', referencedColumnName: 'id' },
  })
  targetBatches!: Batch[];

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
