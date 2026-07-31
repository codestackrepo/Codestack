import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { Topic } from './topic.entity';

/**
 * One comment on a topic (#76). Shape owned by migration 1785570000000.
 */
@Entity('topic_comments')
export class TopicComment extends BaseEntity {
  @Column({ type: 'uuid', name: 'topic_id' })
  topicId!: string;

  @ManyToOne(() => Topic, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'topic_id' })
  topic?: Topic;

  @Column({ type: 'uuid', name: 'author_id' })
  authorId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'author_id' })
  author?: User;

  /**
   * The AUTHOR's org, NOT NULL even on a global topic — this column is what
   * org-partitions a shared thread.
   *
   * Without it a global topic would be a cross-tenant channel: students from every
   * organization reading and replying to one another. With it, a global topic is one
   * thread per organization that happens to share a title, and `scopeToOrg` on this
   * column does all of the work with no branch on topic scope anywhere.
   */
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;

  @Column({ type: 'text' })
  body!: string;

  /** Reply target. Validated to be a top-level comment in the same topic AND the same org partition. */
  @Column({ type: 'uuid', name: 'parent_id', nullable: true })
  parentId!: string | null;

  /** Marks this as a doubt: it fans out to staff and appears in the doubts view. */
  @Column({ type: 'boolean', name: 'is_question', default: false })
  isQuestion!: boolean;

  /**
   * The resolved state. `chk_topic_comment_resolved` forbids this on a
   * non-question, so the doubts view can never surface a row that was never asked.
   */
  @Column({ type: 'timestamptz', name: 'resolved_at', nullable: true })
  resolvedAt!: Date | null;

  /**
   * Attribution only — the FK is `ON DELETE SET NULL`, so a departing staff account
   * blanks this while `resolvedAt` keeps the state. Same split as #75's
   * `problem_feedback.resolved_by_id`, which is where that lesson was learned.
   */
  @Column({ type: 'uuid', name: 'resolved_by_id', nullable: true })
  resolvedById!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'resolved_by_id' })
  resolvedBy?: User | null;
}
