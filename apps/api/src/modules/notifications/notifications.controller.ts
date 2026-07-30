import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { AllowsUnassigned } from '../../common/decorators/allows-unassigned.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { NotificationsService } from './notifications.service';

/**
 * Class-level `@AllowsUnassigned` is safe here because ALL FOUR handlers are
 * keyed on `actor.id` — the service filters every read and write by recipient, so
 * an org-less user can only ever see and mutate their own rows. An assignment or
 * invite notification is exactly what they need while confined.
 */
@ApiTags('notifications')
@ApiCookieAuth('access_token')
@AllowsUnassigned()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** The caller's own notifications, newest first (optionally unread-only). */
  @Get()
  list(@Query() query: NotificationQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.notifications.list(actor, query);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() actor: AuthenticatedUser) {
    return this.notifications.unreadCount(actor);
  }

  @Patch(':id/read')
  @HttpCode(204)
  markRead(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.notifications.markRead(id, actor);
  }

  @Post('read-all')
  @HttpCode(200)
  markAllRead(@CurrentUser() actor: AuthenticatedUser) {
    return this.notifications.markAllRead(actor);
  }
}
