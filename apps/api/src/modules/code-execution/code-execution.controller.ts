import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { RunCodeDto, SubmitCodeDto } from './dto/code-execution.dto';
import { CodeExecutionService, SubmitResult } from './services/code-execution.service';
import { RunResult, RunService } from './services/run.service';

@ApiTags('code-execution')
@ApiCookieAuth('access_token')
@Controller('code-execution')
export class CodeExecutionController {
  constructor(
    private readonly codeExecution: CodeExecutionService,
    private readonly runService: RunService,
  ) {}

  /** Enqueue a full judged submission. Returns 202 + submissionId (Pending). */
  @Post('submit')
  @HttpCode(202)
  @Throttle({ minute: { limit: 1, ttl: 60_000 }, day: { limit: 50, ttl: 86_400_000 } })
  submit(
    @Body() dto: SubmitCodeDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<SubmitResult> {
    return this.codeExecution.submit(dto, actor);
  }

  /** Run against client-supplied sample testcases (synchronous, no persistence). */
  @Post('run')
  @HttpCode(200)
  @Throttle({ minute: { limit: 5, ttl: 60_000 }, day: { limit: 50, ttl: 86_400_000 } })
  run(@Body() dto: RunCodeDto, @CurrentUser() actor: AuthenticatedUser): Promise<RunResult> {
    return this.runService.run(dto, actor);
  }
}
