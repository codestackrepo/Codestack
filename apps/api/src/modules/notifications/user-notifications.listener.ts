import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  USER_ACCESS_GRANTED,
  USER_ACCESS_REVOKED,
  USER_ORGANIZATION_ASSIGNED,
  UserAccessChangedEvent,
  UserOrganizationAssignedEvent,
} from '../../common/events/user-events';
import { MailService } from '../mail/mail.service';
import { MailTemplate } from '../mail/mail.types';
import { NotificationType } from './enums/notification-type.enum';
import { NotificationsService } from './notifications.service';

/**
 * Turns user-administration events into a notification plus a mail.
 *
 * Separate from NotificationsListener (which expands ASSIGNMENT_* events through
 * classroom rosters) because these are single-recipient and need MailService,
 * which the assignment listener has no business importing.
 *
 * Every handler swallows its own failure. An access change has ALREADY COMMITTED
 * by the time the event fires — throwing here would surface as an unhandled
 * rejection and, worse, would tempt a future reader to move the emit inside the
 * transaction, where a mail failure would roll back a revoke that the operator
 * was told had succeeded.
 */
@Injectable()
export class UserNotificationsListener {
  private readonly logger = new Logger(UserNotificationsListener.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  @OnEvent(USER_ACCESS_REVOKED)
  async onAccessRevoked(event: UserAccessChangedEvent): Promise<void> {
    await this.deliver(event, {
      type: NotificationType.ACCESS_REVOKED,
      title: 'Your access was turned off',
      // Deliberately does not name the actor or the org — same reticence as the
      // mail template.
      message: 'An administrator has turned off your access to CodeStack.',
      template: MailTemplate.ACCESS_REVOKED,
    });
  }

  @OnEvent(USER_ACCESS_GRANTED)
  async onAccessGranted(event: UserAccessChangedEvent): Promise<void> {
    await this.deliver(event, {
      type: NotificationType.ACCESS_RESTORED,
      title: 'Your access was restored',
      message: 'You can sign in to CodeStack again.',
      template: MailTemplate.ACCESS_RESTORED,
    });
  }

  @OnEvent(USER_ORGANIZATION_ASSIGNED)
  async onOrganizationAssigned(event: UserOrganizationAssignedEvent): Promise<void> {
    try {
      await this.notifications.createForRecipients({
        recipientIds: [event.userId],
        actorId: event.actorId,
        type: NotificationType.ORGANIZATION_ASSIGNED,
        title: `You've joined ${event.organizationName}`,
        message: 'Your classrooms, assignments and problems are available now.',
        entityType: 'organization',
        entityId: event.organizationId,
        link: '/home/dashboard',
      });
      await this.mail.enqueue({
        to: event.email,
        template: MailTemplate.ORG_ASSIGNED,
        params: {
          firstName: event.firstName,
          lastName: event.lastName,
          orgName: event.organizationName,
          loginUrl: this.mail.webUrl('login'),
        },
      });
    } catch (err) {
      this.logger.error(`ORGANIZATION_ASSIGNED fan-out failed for ${event.userId}: ${String(err)}`);
    }
  }

  private async deliver(
    event: UserAccessChangedEvent,
    opts: {
      type: NotificationType;
      title: string;
      message: string;
      // Narrowed to the two access templates rather than MailTemplate: both take
      // exactly AccessChangeParams, so widening here would break the discriminated
      // union that makes a params/template mismatch a compile error.
      template: MailTemplate.ACCESS_REVOKED | MailTemplate.ACCESS_RESTORED;
    },
  ): Promise<void> {
    try {
      await this.notifications.createForRecipients({
        recipientIds: [event.userId],
        actorId: event.actorId,
        type: opts.type,
        title: opts.title,
        message: opts.message,
        entityType: 'user',
        entityId: event.userId,
        link: '/home/profile',
      });
      await this.mail.enqueue({
        to: event.email,
        template: opts.template,
        params: { firstName: event.firstName, lastName: event.lastName },
      });
    } catch (err) {
      this.logger.error(`${opts.type} fan-out failed for ${event.userId}: ${String(err)}`);
    }
  }
}
