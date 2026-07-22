import { Module } from '@nestjs/common';
import { CodeExecutionModule } from '../code-execution/code-execution.module';
import { PlaygroundController } from './playground.controller';
import { PlaygroundService } from './playground.service';

@Module({
  imports: [CodeExecutionModule],
  controllers: [PlaygroundController],
  providers: [PlaygroundService],
})
export class PlaygroundModule {}
