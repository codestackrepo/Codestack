import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { BillingConfig } from '../../config/configuration';
import { Invoice } from './entities/invoice.entity';
import { Plan } from './entities/plan.entity';
import { Subscription } from './entities/subscription.entity';
import { PAYMENT_PROVIDER, PaymentProvider } from './payment/payment-provider.interface';
import { SubscriptionService } from './services/subscription.service';

@Injectable()
export class BillingService {
  private readonly billing: BillingConfig;

  constructor(
    config: ConfigService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly subscriptionService: SubscriptionService,
    @InjectRepository(Plan) private readonly plans: Repository<Plan>,
    @InjectRepository(Invoice) private readonly invoices: Repository<Invoice>,
  ) {
    this.billing = config.getOrThrow<BillingConfig>('billing');
  }

  listActivePlans(): Promise<Plan[]> {
    return this.plans.find({ where: { active: true }, order: { priceMinorUnits: 'ASC' } });
  }

  async checkout(userId: string, email: string, planCode: string): Promise<{ url: string }> {
    const plan = await this.plans.findOneBy({ code: planCode, active: true });
    if (!plan) throw new NotFoundException(`Unknown or inactive plan "${planCode}"`);

    // Reuse the Stripe customer from any prior subscription (even a canceled
    // one) rather than minting a new one every checkout attempt.
    const priorSub = await this.subscriptionService.getLatestForUser(userId);
    const customerId =
      priorSub?.providerCustomerId ?? (await this.provider.createCustomer(userId, email));

    return this.provider.createCheckoutSession({
      customerId,
      priceId: plan.stripePriceId,
      successUrl: this.billing.successUrl,
      cancelUrl: this.billing.cancelUrl,
      // A fresh key per attempt — this only needs to dedupe accidental
      // double-submits of the same click, not block a legitimate resubscribe.
      idempotencyKey: randomUUID(),
    });
  }

  getSubscription(userId: string): Promise<Subscription | null> {
    return this.subscriptionService.getLatestForUser(userId);
  }

  cancelSubscription(userId: string): Promise<Subscription> {
    return this.subscriptionService.cancel(userId);
  }

  listInvoices(userId: string): Promise<Invoice[]> {
    return this.invoices.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }
}
