import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Role } from '../../common/enums/role.enum';
import { isSuperAdmin, scopeToOrg } from '../../common/tenancy/tenant-scope.util';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { User } from '../users/entities/user.entity';
import { CreateTopicCommentDto, CreateTopicDto, UpdateTopicDto } from './dto/topic.dto';
import { TopicComment } from './entities/topic-comment.entity';
import { Topic } from './entities/topic.entity';

const STAFF_ROLES = [Role.ADMIN, Role.PROFESSOR];

@Injectable()
export class TopicsService {
  private readonly logger = new Logger(TopicsService.name);

  constructor(
    @InjectRepository(Topic) private readonly topics: Repository<Topic>,
    @InjectRepository(TopicComment) private readonly comments: Repository<TopicComment>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly notifications: NotificationsService,
  ) {}

  // ------------------------------------------------------------------- topics

  /**
   * Visible topics: the actor's own org PLUS every global one.
   *
   * `includeGlobal: true` is exactly what that means, and it is the only place in
   * this service that opts into it — comments never do, because a global TOPIC is
   * shared while its comments are not.
   */
  async listTopics(actor: AuthenticatedUser): Promise<{ topic: Topic; commentCount: number }[]> {
    const qb = this.topics
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.createdBy', 'createdBy')
      .orderBy('t.createdAt', 'DESC');
    scopeToOrg(qb, 't', actor, { includeGlobal: true });
    const rows = await qb.getMany();
    if (!rows.length) return [];

    // Counts are computed in the ACTOR's partition, so the number a user sees on a
    // global topic is their own organization's comment count, not the platform's.
    const counts = await this.commentCounts(
      rows.map((t) => t.id),
      actor,
    );
    return rows.map((topic) => ({ topic, commentCount: counts.get(topic.id) ?? 0 }));
  }

  /** One topic, subject to the same predicate as the list. */
  async getTopic(id: string, actor: AuthenticatedUser): Promise<Topic> {
    const qb = this.topics
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.createdBy', 'createdBy')
      .where('t.id = :id', { id });
    scopeToOrg(qb, 't', actor, { includeGlobal: true });
    const topic = await qb.getOne();
    if (!topic) throw new NotFoundException({ reason: 'topic_not_found' });
    return topic;
  }

  /**
   * Create a topic. Staff only (enforced by `@Roles` on the route).
   *
   * `global: true` is SuperAdmin-only and is REJECTED for anyone else rather than
   * silently downgraded to an org topic — a professor who believes they published
   * platform-wide and did not would never find out.
   */
  async createTopic(dto: CreateTopicDto, actor: AuthenticatedUser): Promise<Topic> {
    if (dto.global && !isSuperAdmin(actor)) {
      throw new ForbiddenException({
        reason: 'global_topic_forbidden',
        message: 'Only a platform administrator can create a global topic',
      });
    }
    if (!dto.global && !actor.organizationId) {
      // A SuperAdmin has no org, so an org-scoped topic has no tenant to belong to.
      throw new BadRequestException({
        reason: 'organization_required',
        message: 'A platform administrator can only create global topics',
      });
    }

    return this.topics.save(
      this.topics.create({
        organizationId: dto.global ? null : actor.organizationId,
        title: dto.title,
        description: dto.description ?? '',
        createdById: actor.id,
        isLocked: false,
      }),
    );
  }

  /** Edit / lock. Staff only, and never across the tenant boundary. */
  async updateTopic(id: string, dto: UpdateTopicDto, actor: AuthenticatedUser): Promise<Topic> {
    const topic = await this.getTopic(id, actor);
    // A global topic is platform property: an org's staff may read and comment on it
    // but must not retitle or lock it for everyone.
    if (topic.organizationId === null && !isSuperAdmin(actor)) {
      throw new ForbiddenException({
        reason: 'global_topic_forbidden',
        message: 'Only a platform administrator can modify a global topic',
      });
    }
    if (dto.title !== undefined) topic.title = dto.title;
    if (dto.description !== undefined) topic.description = dto.description;
    if (dto.isLocked !== undefined) topic.isLocked = dto.isLocked;
    return this.topics.save(topic);
  }

  // ----------------------------------------------------------------- comments

  /**
   * The thread, ORG-PARTITIONED.
   *
   * This is the whole tenancy story for #76: `scopeToOrg` runs on the COMMENT's
   * `organization_id` (the author's) with NO `includeGlobal`, so a global topic
   * resolves to one thread per organization. There is deliberately no branch on
   * `topic.organizationId` here — the partition is a property of the comment rows,
   * not of the topic, which is why a shared topic cannot leak.
   */
  async listComments(topicId: string, actor: AuthenticatedUser): Promise<TopicComment[]> {
    await this.getTopic(topicId, actor); // authorizes the topic itself
    const qb = this.comments
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.author', 'author')
      .where('c.topicId = :topicId', { topicId })
      .orderBy('c.createdAt', 'ASC');
    scopeToOrg(qb, 'c', actor);
    return qb.getMany();
  }

  /** Unanswered questions across the actor's org. The staff doubts view. */
  async listOpenQuestions(actor: AuthenticatedUser): Promise<TopicComment[]> {
    const qb = this.comments
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.author', 'author')
      .leftJoinAndSelect('c.topic', 'topic')
      .where('c.isQuestion = true')
      .andWhere('c.resolvedAt IS NULL')
      .orderBy('c.createdAt', 'DESC')
      .take(200);
    scopeToOrg(qb, 'c', actor);
    return qb.getMany();
  }

  async addComment(
    topicId: string,
    dto: CreateTopicCommentDto,
    actor: AuthenticatedUser,
  ): Promise<TopicComment> {
    const topic = await this.getTopic(topicId, actor);
    if (topic.isLocked) {
      throw new ForbiddenException({ reason: 'topic_locked', message: 'This topic is locked' });
    }
    if (!actor.organizationId) {
      // The comment org column is NOT NULL and partitions the thread; a SuperAdmin
      // has no partition to write into. They own the topic, not the discussion.
      throw new ForbiddenException({
        reason: 'no_organization',
        message: 'Comments are written inside an organization',
      });
    }

    if (dto.parentId) await this.assertRepliable(dto.parentId, topicId, actor.organizationId);

    const saved = await this.comments.save(
      this.comments.create({
        topicId,
        authorId: actor.id,
        organizationId: actor.organizationId,
        body: dto.body,
        parentId: dto.parentId ?? null,
        isQuestion: dto.isQuestion ?? false,
      }),
    );

    if (saved.isQuestion) await this.notifyStaff(saved, topic, actor);
    return this.comments.findOneOrFail({ where: { id: saved.id }, relations: { author: true } });
  }

  /**
   * Mark a question answered. Staff only.
   *
   * Conditional UPDATE guarded on `resolved_at IS NULL`, the same single-transition
   * control #75 and the invite consume use: two staff resolving the same doubt must
   * not both succeed with the second overwriting the first's attribution.
   */
  async resolveQuestion(commentId: string, actor: AuthenticatedUser): Promise<TopicComment> {
    const qb = this.comments.createQueryBuilder('c').where('c.id = :id', { id: commentId });
    scopeToOrg(qb, 'c', actor);
    const found = await qb.getOne();
    if (!found) throw new NotFoundException({ reason: 'comment_not_found' });
    if (!found.isQuestion) {
      throw new BadRequestException({
        reason: 'not_a_question',
        message: 'Only a question can be resolved',
      });
    }

    const result = await this.comments
      .createQueryBuilder()
      .update(TopicComment)
      .set({ resolvedAt: () => 'now()', resolvedById: actor.id, updatedAt: () => 'now()' })
      .where('id = :id AND resolved_at IS NULL', { id: commentId })
      .execute();
    if (result.affected !== 1) {
      throw new ForbiddenException({
        reason: 'already_resolved',
        message: 'This question has already been resolved',
      });
    }

    await this.notifyAuthorResolved(found, actor);
    return this.comments.findOneOrFail({ where: { id: commentId }, relations: { author: true } });
  }

  /** Author-or-staff delete. Replies cascade with the parent (FK). */
  async deleteComment(commentId: string, actor: AuthenticatedUser): Promise<void> {
    const qb = this.comments.createQueryBuilder('c').where('c.id = :id', { id: commentId });
    scopeToOrg(qb, 'c', actor);
    const found = await qb.getOne();
    if (!found) throw new NotFoundException({ reason: 'comment_not_found' });

    const isStaff = STAFF_ROLES.includes(actor.role) || isSuperAdmin(actor);
    if (found.authorId !== actor.id && !isStaff) {
      throw new ForbiddenException({ reason: 'not_your_comment' });
    }
    await this.comments.delete({ id: commentId });
  }

  // ------------------------------------------------------------------ helpers

  /**
   * A reply target must be in the same topic AND the same org partition, and must
   * itself be top-level.
   *
   * The org check is what stops a reply from linking across the partition of a
   * global topic — without it, a crafted `parentId` would thread one org's comment
   * under another's even though neither can read the other.
   */
  private async assertRepliable(parentId: string, topicId: string, orgId: string): Promise<void> {
    const parent = await this.comments.findOne({ where: { id: parentId } });
    if (!parent || parent.topicId !== topicId || parent.organizationId !== orgId) {
      // One opaque answer for "no such comment", "different topic" and "another
      // org's comment" — distinguishing them would confirm a row exists outside the
      // caller's partition.
      throw new BadRequestException({ reason: 'invalid_parent' });
    }
    if (parent.parentId !== null) {
      throw new BadRequestException({
        reason: 'nested_reply',
        message: 'Replies are one level deep',
      });
    }
  }

  /** Comment counts per topic within the actor's partition. */
  private async commentCounts(
    topicIds: string[],
    actor: AuthenticatedUser,
  ): Promise<Map<string, number>> {
    const qb: SelectQueryBuilder<TopicComment> = this.comments
      .createQueryBuilder('c')
      .select('c.topic_id', 'topicId')
      .addSelect('COUNT(*)::int', 'n')
      .where('c.topic_id IN (:...ids)', { ids: topicIds })
      .groupBy('c.topic_id');
    scopeToOrg(qb, 'c', actor);
    const rows = await qb.getRawMany<{ topicId: string; n: number }>();
    return new Map(rows.map((r) => [r.topicId, Number(r.n)]));
  }

  /**
   * A question fans out to the AUTHOR's own org staff — the same routing rule as
   * #75. On a global topic that means the asker's staff, never the platform author's,
   * and the recipients come from the comment's own org so there is no branch.
   */
  private async notifyStaff(
    comment: TopicComment,
    topic: Topic,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const staff = await this.users.find({
      where: { organizationId: comment.organizationId, isActive: true },
      select: { id: true, role: true },
    });
    const recipientIds = staff.filter((u) => STAFF_ROLES.includes(u.role)).map((u) => u.id);
    if (!recipientIds.length) return;

    try {
      await this.notifications.createForRecipients({
        recipientIds,
        actorId: actor.id,
        type: NotificationType.TOPIC_DOUBT_RAISED,
        title: `New question: ${topic.title}`,
        message: `A student asked a question in "${topic.title}".`,
        entityType: 'topic_comment',
        entityId: comment.id,
        link: `/home/topics/${topic.id}`,
      });
    } catch (err) {
      // The comment is committed; a notification failure must not 500 a successful write.
      this.logger.error(
        `Topic comment ${comment.id} saved but notification failed: ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async notifyAuthorResolved(
    comment: TopicComment,
    actor: AuthenticatedUser,
  ): Promise<void> {
    try {
      await this.notifications.createForRecipients({
        recipientIds: [comment.authorId],
        actorId: actor.id,
        type: NotificationType.TOPIC_DOUBT_RESOLVED,
        title: 'Your question was answered',
        message: 'Staff marked your question as resolved.',
        entityType: 'topic_comment',
        entityId: comment.id,
        link: `/home/topics/${comment.topicId}`,
      });
    } catch (err) {
      this.logger.error(
        `Topic comment ${comment.id} resolved but notification failed: ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
