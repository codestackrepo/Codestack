import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../../common/entities/base.entity';
import { User } from '../../../users/entities/user.entity';
import { Problem } from '../../entities/problem.entity';
import { ProblemFeedbackKind, ProblemFeedbackStatus } from '../enums/problem-feedback.enums';

/**
 * Student feedback on a problem (#75). Shape owned by migration 1785560000000;
 * every index and CHECK is declared there and nowhere here — two of the three
 * indexes are partial or DESC-ordered, which a column-level `@Index` cannot
 * express.
 */
@Entity('problem_feedback')
export class ProblemFeedback extends BaseEntity {
  @Column({ type: 'uuid', name: 'problem_id' })
  problemId!: string;

  @ManyToOne(() => Problem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'problem_id' })
  problem?: Problem;

  @Column({ type: 'uuid', name: 'author_id' })
  authorId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'author_id' })
  author?: User;

  /**
   * The AUTHOR's organization, never the problem's — see the migration header.
   *
   * A global problem carries `organization_id IS NULL`, so inheriting it would put
   * every doubt about a platform problem into a tenant that `scopeToOrg` cannot
   * match and no staff can reach. This is the column the whole tenancy story for
   * feedback hangs on, which is why it is NOT NULL.
   */
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;

  @Column({ type: 'varchar', length: 20 })
  kind!: ProblemFeedbackKind;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'varchar', length: 20, default: ProblemFeedbackStatus.OPEN })
  status!: ProblemFeedbackStatus;

  /**
   * Nullable even when resolved. The resolver FK is `ON DELETE SET NULL`, so a
   * deleted staff account blanks this while the resolution survives.
   *
   * `chk_problem_feedback_resolution` therefore keys the resolved state on
   * `resolved_at`, NOT on this column — an earlier draft required both, and that
   * made deleting any staff member who had ever resolved feedback fail with a
   * check-constraint violation, because SET NULL re-evaluates the CHECK.
   */
  @Column({ type: 'uuid', name: 'resolved_by_id', nullable: true })
  resolvedById!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'resolved_by_id' })
  resolvedBy?: User | null;

  @Column({ type: 'timestamptz', name: 'resolved_at', nullable: true })
  resolvedAt!: Date | null;

  @Column({ type: 'text', name: 'resolution_note', nullable: true })
  resolutionNote!: string | null;
}
