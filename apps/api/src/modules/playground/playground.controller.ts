import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { PlaygroundRunDto } from './dto/playground.dto';
import { PlaygroundResult, PlaygroundService } from './playground.service';

@ApiTags('playground')
@Controller('playground')
export class PlaygroundController {
  constructor(private readonly playground: PlaygroundService) {}

  // Public and unauthenticated by design (TS-Playground-style UX), so it is
  // the platform's highest-abuse surface — throttled strictly per-IP and
  // isolated from judged submissions by sharing only the bounded Piston pool.
  @Public()
  @Post('run')
  @HttpCode(200)
  @Throttle({ minute: { limit: 10, ttl: 60_000 }, day: { limit: 100, ttl: 86_400_000 } })
  run(@Body() dto: PlaygroundRunDto): Promise<PlaygroundResult> {
    return this.playground.run(dto.language, dto.userCode, dto.stdin ?? '');
  }
}
