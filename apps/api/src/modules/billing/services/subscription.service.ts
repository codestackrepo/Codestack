import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Plan } from '../entities/plan.entity';
import { Subscription } from '../entities/subscription.entity';
import { SubscriptionStatus } from '../enums/billing.enums';
import {
  PAYMENT_PROVIDER,
  PaymentProvider,
  ProviderSubscriptionSnapshot,
} from '../payment/payment-provider.interface';

const LIVE_STATUSES = [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING];

/**
 * Owns the local Subscription state machine. Every mutation is an *upsert
 * from the provider's current, authoritative snapshot* — never a diff
 * against the previous local row — so redelivered or out-of-order webhooks
 * converge to the same end state regardless of arrival order.
 */
@Injectable()
export class SubscriptionService {
  constructor(
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @InjectRepository(Subscription) private readonly subscriptions: Repository<Subscription>,
    @InjectRepository(Plan) private readonly plans: Repository<Plan>,
  ) {}

  async upsertFromSnapshot(
    userId: string,
    snapshot: ProviderSubscriptionSnapshot,
  ): Promise<Subscription> {
    const plan = await this.plans.findOneBy({ stripePriceId: snapshot.priceId });
    if (!plan) {
      throw new Error(`No Plan is configured for Stripe price "${snapshot.priceId}"`);
    }

    const existing = await this.subscriptions.findOneBy({
      providerSubscriptionId: snapshot.id,
    });
    const row =
      existing ??
      this.subscriptions.create({
        userId,
        provider: 'stripe',
        providerSubscriptionId: snapshot.id,
      });

    row.planId = plan.id;
    row.status = this.mapStatus(snapshot.status);
    row.providerCustomerId = snapshot.customerId;
    row.currentPeriodStart = snapshot.currentPeriodStart;
    row.currentPeriodEnd = snapshot.currentPeriodEnd;
    row.cancelAtPeriodEnd = snapshot.cancelAtPeriodEnd;

    return this.subscriptions.save(row);
  }

  getActiveForUser(userId: string): Promise<Subscription | null> {
    return this.subscriptions.findOne({
      where: { userId, status: In(LIVE_STATUSES) },
      order: { createdAt: 'DESC' },
      relations: { plan: true },
    });
  }

  getLatestForUser(userId: string): Promise<Subscription | null> {
    return this.subscriptions.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
      relations: { plan: true },
    });
  }

  async cancel(userId: string): Promise<Subscription> {
    const sub = await this.getActiveForUser(userId);
    if (!sub) throw new NotFoundException('No active subscription to cancel');
    await this.provider.cancelSubscription(sub.providerSubscriptionId);
    sub.cancelAtPeriodEnd = true;
    return this.subscriptions.save(sub);
  }

  /** Maps Stripe's native status vocabulary onto ours — see SubscriptionStatus. */
  private mapStatus(stripeStatus: string): SubscriptionStatus {
    switch (stripeStatus) {
      case 'trialing':
        return SubscriptionStatus.TRIALING;
      case 'active':
        return SubscriptionStatus.ACTIVE;
      case 'past_due':
        return SubscriptionStatus.PAST_DUE;
      case 'canceled':
      case 'unpaid':
      case 'incomplete_expired':
        return SubscriptionStatus.CANCELED;
      case 'incomplete':
      default:
        return SubscriptionStatus.INCOMPLETE;
    }
  }
}
