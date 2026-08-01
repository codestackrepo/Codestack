import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { TopicComment } from '../entities/topic-comment.entity';
import { Topic } from '../entities/topic.entity';

/**
 * No `organizationId` field anywhere in these inputs. An org topic is stamped from
 * the actor's org and a global one is a SuperAdmin-only flag — accepting a tenant id
 * from the client is the cross-org write hole every other module also refuses.
 */
export class CreateTopicDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  /** SuperAdmin only. A non-superadmin sending true is rejected, never silently downgraded. */
  @ApiPropertyOptional({ description: 'SuperAdmin only — creates a platform-wide topic.' })
  @IsOptional()
  @IsBoolean()
  global?: boolean;
}

export class UpdateTopicDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isLocked?: boolean;
}

export class CreateTopicCommentDto {
  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(4000)
  body!: string;

  @ApiPropertyOptional({ description: 'Reply target — must be a top-level comment on this topic.' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional({ description: 'Marks this as a doubt; fans out to the org staff.' })
  @IsOptional()
  @IsBoolean()
  isQuestion?: boolean;
}

export class TopicResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiProperty() isLocked!: boolean;
  /** True when the topic is platform-wide. The org id itself is never projected. */
  @ApiProperty() isGlobal!: boolean;
  @ApiPropertyOptional() createdById!: string | null;
  @ApiPropertyOptional() createdByName?: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiPropertyOptional() commentCount?: number;

  static from(t: Topic, commentCount?: number): TopicResponseDto {
    return {
      id: t.id,
      title: t.title,
      description: t.description,
      isLocked: t.isLocked,
      isGlobal: t.organizationId === null,
      createdById: t.createdById,
      createdByName: t.createdBy ? `${t.createdBy.firstName} ${t.createdBy.lastName}` : null,
      createdAt: t.createdAt,
      ...(commentCount === undefined ? {} : { commentCount }),
    };
  }
}

export class TopicCommentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() topicId!: string;
  @ApiProperty() authorId!: string;
  @ApiPropertyOptional() authorName?: string | null;
  @ApiProperty() body!: string;
  @ApiPropertyOptional() parentId!: string | null;
  @ApiProperty() isQuestion!: boolean;
  @ApiPropertyOptional() resolvedAt!: Date | null;
  @ApiPropertyOptional() resolvedById!: string | null;
  @ApiProperty() createdAt!: Date;

  /**
   * `revealAuthor: false` blanks the author's identity (#118).
   *
   * A discussion thread is the cheapest identity leak on the platform: a global topic
   * is visible to open-platform members, so without this a plain self-signup student
   * could read `authorId` + `authorName` for everyone who ever commented — no
   * professor application needed, which is cheaper than the threat the community
   * lockout was originally written against.
   *
   * The comment BODY survives, because the thread is the point; only who wrote it is
   * withheld. Callers pass `canReadStaffDirectory(actor)`, which is true for everyone
   * inside a real organization and for a superadmin, so nothing changes there.
   */
  static from(c: TopicComment, revealAuthor = true): TopicCommentResponseDto {
    return {
      id: c.id,
      topicId: c.topicId,
      authorId: revealAuthor ? c.authorId : '',
      authorName:
        revealAuthor && c.author ? `${c.author.firstName} ${c.author.lastName}` : null,
      body: c.body,
      parentId: c.parentId,
      isQuestion: c.isQuestion,
      resolvedAt: c.resolvedAt,
      resolvedById: c.resolvedById,
      createdAt: c.createdAt,
    };
  }
}
