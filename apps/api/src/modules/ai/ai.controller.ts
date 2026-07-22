import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CreateGenerationDto } from './dto/create-generation.dto';
import {
  GeneratedProblemLinkResponseDto,
  GenerationRequestResponseDto,
} from './dto/generation-response.dto';
import { GenerationRequestService } from './generation/generation-request.service';

@ApiTags('ai')
@ApiCookieAuth('access_token')
@Controller('ai')
export class AiController {
  constructor(private readonly generationRequests: GenerationRequestService) {}

  @Post('generations')
  @HttpCode(202)
  // Matches AI_RATE_LIMIT_PER_HOUR's default (see config/env.validation.ts) —
  // same "hardcode the current default" convention already used by the
  // run/submit throttles in code-execution.controller.ts.
  @Throttle({ hour: { limit: 5, ttl: 3_600_000 } })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  createGeneration(
    @Body() dto: CreateGenerationDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<GenerationRequestResponseDto> {
    return this.generationRequests
      .create(dto, file, actor.id)
      .then(GenerationRequestResponseDto.from);
  }

  @Get('generations')
  async listGenerations(
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<GenerationRequestResponseDto[]> {
    const rows = await this.generationRequests.list(actor.id);
    return rows.map(GenerationRequestResponseDto.from);
  }

  @Get('generations/:id')
  async getGeneration(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<GenerationRequestResponseDto> {
    const row = await this.generationRequests.findOwned(id, actor.id);
    return GenerationRequestResponseDto.from(row);
  }

  @Get('generations/:id/problems')
  async getGeneratedProblems(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<GeneratedProblemLinkResponseDto[]> {
    const rows = await this.generationRequests.listProblems(id, actor.id);
    return rows.map(GeneratedProblemLinkResponseDto.from);
  }

  @Post('generations/:id/problems/:linkId/save')
  async saveProblem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<GeneratedProblemLinkResponseDto> {
    const link = await this.generationRequests.saveProblem(id, linkId, actor.id);
    return GeneratedProblemLinkResponseDto.from(link);
  }
}
