import { BadRequestException, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { ClerkWebhookService, ClerkWebhookSignatureError } from './clerk-webhook.service';

@ApiTags('webhooks')
@Controller('webhooks')
export class ClerkWebhookController {
  constructor(private readonly webhooks: ClerkWebhookService) {}

  // No auth (Clerk can't send our cookies) — integrity comes entirely from the
  // svix signature check inside ClerkWebhookService, over the RAW body
  // (`rawBody: true` in main.ts keeps `req.rawBody` un-mangled by the global JSON
  // body parser). No @Body() DTO, so the global ValidationPipe never touches this
  // arbitrary Clerk-shaped payload. Mirrors the Stripe webhook.
  @Public()
  @Post('clerk')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async clerk(@Req() req: RawBodyRequest<Request>): Promise<{ received: true }> {
    const id = req.headers['svix-id'];
    const timestamp = req.headers['svix-timestamp'];
    const signature = req.headers['svix-signature'];
    if (
      !req.rawBody ||
      typeof id !== 'string' ||
      typeof timestamp !== 'string' ||
      typeof signature !== 'string'
    ) {
      throw new BadRequestException('Missing raw body or svix signature headers');
    }
    try {
      await this.webhooks.handle(req.rawBody, { id, timestamp, signature });
    } catch (err) {
      // A bad/forged signature is a malformed request, not a server fault — 400
      // (so it reads correctly in Clerk's delivery log); real processing bugs
      // propagate as 500 so Clerk retries them.
      if (err instanceof ClerkWebhookSignatureError) {
        throw new BadRequestException('Invalid webhook signature');
      }
      throw err;
    }
    return { received: true };
  }
}
