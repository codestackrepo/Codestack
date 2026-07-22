import { BadRequestException, Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { BillingService } from './billing.service';
import {
  CheckoutResponseDto,
  InvoiceResponseDto,
  PlanResponseDto,
  SubscriptionResponseDto,
} from './dto/billing-response.dto';
import { CreateCheckoutDto } from './dto/checkout.dto';
import { BillingWebhookService, WebhookSignatureError } from './services/billing-webhook.service';

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly webhooks: BillingWebhookService,
  ) {}

  @Public()
  @Get('plans')
  async listPlans(): Promise<PlanResponseDto[]> {
    const plans = await this.billing.listActivePlans();
    return plans.map(PlanResponseDto.from);
  }

  @ApiCookieAuth('access_token')
  @Post('checkout')
  checkout(
    @Body() dto: CreateCheckoutDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<CheckoutResponseDto> {
    return this.billing.checkout(actor.id, actor.email, dto.planCode);
  }

  @ApiCookieAuth('access_token')
  @Get('subscription')
  async getSubscription(
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<SubscriptionResponseDto | null> {
    const sub = await this.billing.getSubscription(actor.id);
    return sub ? SubscriptionResponseDto.from(sub) : null;
  }

  @ApiCookieAuth('access_token')
  @Post('subscription/cancel')
  async cancelSubscription(
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<SubscriptionResponseDto> {
    const sub = await this.billing.cancelSubscription(actor.id);
    return SubscriptionResponseDto.from(sub);
  }

  @ApiCookieAuth('access_token')
  @Get('invoices')
  async listInvoices(@CurrentUser() actor: AuthenticatedUser): Promise<InvoiceResponseDto[]> {
    const invoices = await this.billing.listInvoices(actor.id);
    return invoices.map(InvoiceResponseDto.from);
  }

  // No auth (Stripe can't send our cookies) — integrity comes entirely from
  // the signature check inside BillingWebhookService, over the RAW body
  // (`rawBody: true` in main.ts keeps `req.rawBody` un-mangled by the global
  // JSON body parser). Deliberately no @Body() DTO here either, so the
  // global ValidationPipe never touches this arbitrary provider-shaped payload.
  @Public()
  @Post('webhook')
  @HttpCode(200)
  async webhook(@Req() req: RawBodyRequest<Request>): Promise<{ received: true }> {
    const signature = req.headers['stripe-signature'];
    if (!req.rawBody || typeof signature !== 'string') {
      throw new BadRequestException('Missing raw body or Stripe signature header');
    }
    try {
      await this.webhooks.handle(req.rawBody, signature);
    } catch (err) {
      // A bad/forged signature is a malformed request, not a server fault —
      // surface 400 so it doesn't read as "our server is broken" in the
      // Stripe dashboard's webhook delivery log, and so unrelated processing
      // bugs (which propagate as-is) stay distinguishable as 500s.
      if (err instanceof WebhookSignatureError) {
        throw new BadRequestException('Invalid webhook signature');
      }
      throw err;
    }
    return { received: true };
  }
}
