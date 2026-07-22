import { Injectable } from '@nestjs/common';
import { Entitlement } from '../enums/billing.enums';
import { SubscriptionService } from './subscription.service';

/**
 * Pure, subscription-based entitlement check — no knowledge of any specific
 * feature's free tier (that logic belongs to the feature module itself; see
 * AiModule's GenerationRequestService, which layers its own free-generation
 * quota on top of this). Keeps the dependency direction one-way: feature
 * modules depend on Billing for gating, Billing never depends on them.
 */
@Injectable()
export class EntitlementService {
  constructor(private readonly subscriptions: SubscriptionService) {}

  async hasActiveEntitlement(userId: string, entitlement: Entitlement): Promise<boolean> {
    const sub = await this.subscriptions.getActiveForUser(userId);
    if (!sub) return false;
    if (sub.currentPeriodEnd.getTime() <= Date.now()) return false;
    return Boolean(sub.plan?.features?.[entitlement]);
  }
}
