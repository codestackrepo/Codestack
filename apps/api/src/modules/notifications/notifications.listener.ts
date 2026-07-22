import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ASSIGNMENT_GRADES_PUBLISHED,
  ASSIGNMENT_PROBLEM_ADDED,
  ASSIGNMENT_PUBLISHED,
  AssignmentGradesPublishedEvent,
  AssignmentProblemAddedEvent,
  AssignmentPublishedEvent,
} from '../../common/events/notification-events';
import { ClassroomsService } from '../classrooms/classrooms.service';
import { NotificationsService } from './notifications.service';
import { NotificationType } from './enums/notification-type.enum';

interface FanOutOptions {
  type: NotificationType;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  link: string;
  /** Include classroom graders (student-role) in addition to students. */
  includeGraders: boolean;
}

/**
 * Expands assignment domain events into per-recipient notifications. Kept
 * separate from NotificationsService so the service stays a pure, testable
 * persistence module and the event wiring lives in one place.
 */
@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger(NotificationsListener.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly classrooms: ClassroomsService,
  ) {}

  @OnEvent(ASSIGNMENT_PUBLISHED)
  async onAssignmentPublished(e: AssignmentPublishedEvent): Promise<void> {
    await this.fanOut(e.classroomId, e.actorId, {
      type: NotificationType.NEW_ASSIGNMENT,
      title: `New assignment: ${e.title}`,
      message: 'A new assignment is now available in your classroom.',
      entityType: 'assignment',
      entityId: e.assignmentId,
      link: '/home/assignments',
      includeGraders: true,
    });
  }

  @OnEvent(ASSIGNMENT_PROBLEM_ADDED)
  async onProblemAdded(e: AssignmentProblemAddedEvent): Promise<void> {
    await this.fanOut(e.classroomId, e.actorId, {
      type: NotificationType.ASSIGNMENT_UPDATED,
      title: `New problem in ${e.assignmentTitle}`,
      message: `"${e.problemTitle}" was added to ${e.assignmentTitle}.`,
      entityType: 'assignment_problem',
      entityId: e.assignmentProblemId,
      link: '/home/assignments',
      includeGraders: true,
    });
  }

  @OnEvent(ASSIGNMENT_GRADES_PUBLISHED)
  async onGradesPublished(e: AssignmentGradesPublishedEvent): Promise<void> {
    await this.fanOut(e.classroomId, e.actorId, {
      type: NotificationType.GRADES_PUBLISHED,
      title: `Grades published: ${e.title}`,
      message: `Your grades and feedback for ${e.title} are now available.`,
      entityType: 'assignment',
      entityId: e.assignmentId,
      link: '/home/assignments',
      includeGraders: false,
    });
  }

  private async fanOut(
    classroomId: string,
    actorId: string,
    opts: FanOutOptions,
  ): Promise<void> {
    try {
      const classroom = await this.classrooms.getDetail(classroomId);
      const recipientIds = (classroom.students ?? []).map((s) => s.id);
      if (opts.includeGraders) {
        recipientIds.push(...(classroom.graders ?? []).map((g) => g.id));
      }
      await this.notifications.createForRecipients({
        recipientIds,
        actorId,
        type: opts.type,
        title: opts.title,
        message: opts.message,
        entityType: opts.entityType,
        entityId: opts.entityId,
        link: opts.link,
      });
    } catch (err) {
      // Never let a notification failure break the triggering action.
      this.logger.error(`Notification fan-out failed for classroom ${classroomId}: ${String(err)}`);
    }
  }
}
