import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { ClassroomsController } from './classrooms.controller';
import { ClassroomsService } from './classrooms.service';
import { Classroom } from './entities/classroom.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Classroom, User])],
  controllers: [ClassroomsController],
  providers: [ClassroomsService],
  exports: [ClassroomsService, TypeOrmModule],
})
export class ClassroomsModule {}
