import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { BatchesController } from './batches.controller';
import { BatchesService } from './batches.service';
import { ClassroomsController } from './classrooms.controller';
import { ClassroomsService } from './classrooms.service';
import { Batch } from './entities/batch.entity';
import { Classroom } from './entities/classroom.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Classroom, User, Batch])],
  controllers: [ClassroomsController, BatchesController],
  providers: [ClassroomsService, BatchesService],
  exports: [ClassroomsService, BatchesService, TypeOrmModule],
})
export class ClassroomsModule {}
