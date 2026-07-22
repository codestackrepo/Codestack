import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { CreateDemoRequestDto } from './dto/create-demo-request.dto';
import { DemoService } from './demo.service';

@ApiTags('demo')
@Controller('demo-requests')
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @Public()
  @Post()
  @HttpCode(201)
  @Throttle({ minute: { limit: 5, ttl: 60_000 }, day: { limit: 20, ttl: 86_400_000 } })
  async create(@Body() dto: CreateDemoRequestDto): Promise<{ id: string; message: string }> {
    const request = await this.demo.create(dto);
    return { id: request.id, message: 'Demo request received' };
  }
}
