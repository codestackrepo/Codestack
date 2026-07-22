import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Notification } from '../entities/notification.entity';
import { NotificationType } from '../enums/notification-type.enum';

export class NotificationResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: NotificationType }) type!: NotificationType;
  @ApiProperty() title!: string;
  @ApiProperty() message!: string;
  @ApiPropertyOptional({ nullable: true }) entityType!: string | null;
  @ApiPropertyOptional({ nullable: true }) entityId!: string | null;
  @ApiPropertyOptional({ nullable: true }) link!: string | null;
  @ApiPropertyOptional({ nullable: true }) readAt!: string | null;
  @ApiProperty() createdAt!: string;

  static from(n: Notification): NotificationResponseDto {
    return {
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      entityType: n.entityType,
      entityId: n.entityId,
      link: n.link,
      readAt: n.readAt ? n.readAt.toISOString() : null,
      createdAt: n.createdAt.toISOString(),
    };
  }
}
