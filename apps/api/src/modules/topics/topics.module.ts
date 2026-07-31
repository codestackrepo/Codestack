import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsModule } from '../notifications/notifications.module';
import { User } from '../users/entities/user.entity';
import { TopicComment } from './entities/topic-comment.entity';
import { Topic } from './entities/topic.entity';
import { TopicsController } from './topics.controller';
import { TopicsService } from './topics.service';

@Module({
  imports: [
    // `User` is registered here rather than importing UsersModule: the staff fan-out
    // needs one SELECT of `{id, role}`, and pulling in the whole user write surface
    // for that would couple this module to far more than it uses.
    TypeOrmModule.forFeature([Topic, TopicComment, User]),
    NotificationsModule, // questions fan out to the asker's own org staff
  ],
  controllers: [TopicsController],
  providers: [TopicsService],
  exports: [TopicsService],
})
export class TopicsModule {}
