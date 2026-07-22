import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassroomsModule } from '../classrooms/classrooms.module';
import { Notification } from './entities/notification.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsListener } from './notifications.listener';
import { NotificationsGateway } from './realtime/notifications.gateway';
import { NotificationEventsService } from './realtime/notification-events.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification]),
    ClassroomsModule, // exports ClassroomsService (recipient roster)
    JwtModule.register({}), // gateway JWT verification, mirroring code-execution.module
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationEventsService,
    NotificationsListener,
    NotificationsGateway,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
