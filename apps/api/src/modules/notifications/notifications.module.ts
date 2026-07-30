import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassroomsModule } from '../classrooms/classrooms.module';
import { MailModule } from '../mail/mail.module';
import { Notification } from './entities/notification.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsListener } from './notifications.listener';
import { UserNotificationsListener } from './user-notifications.listener';
import { NotificationsGateway } from './realtime/notifications.gateway';
import { NotificationEventsService } from './realtime/notification-events.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification]),
    ClassroomsModule, // exports ClassroomsService (recipient roster)
    JwtModule.register({}), // gateway JWT verification, mirroring code-execution.module
    MailModule, // UserNotificationsListener mails alongside each in-app notification
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationEventsService,
    NotificationsListener,
    UserNotificationsListener,
    NotificationsGateway,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
