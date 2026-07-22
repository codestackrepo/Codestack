import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';
import { DemoRequest } from './entities/demo-request.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DemoRequest])],
  controllers: [DemoController],
  providers: [DemoService],
})
export class DemoModule {}
