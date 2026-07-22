import { Entitlement, SubscriptionStatus } from '../enums/billing.enums';
import { EntitlementService } from './entitlement.service';

describe('EntitlementService.hasActiveEntitlement', () => {
  const HOUR = 60 * 60 * 1000;

  it('grants when there is an active subscription with the feature flag set and a future period end', async () => {
    const subscriptions = {
      getActiveForUser: jest.fn().mockResolvedValue({
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: new Date(Date.now() + HOUR),
        plan: { features: { ai: true } },
      }),
    };
    const service = new EntitlementService(subscriptions as any);
    expect(await service.hasActiveEntitlement('user-1', Entitlement.AI)).toBe(true);
  });

  it('denies when there is no active/trialing subscription at all', async () => {
    const subscriptions = { getActiveForUser: jest.fn().mockResolvedValue(null) };
    const service = new EntitlementService(subscriptions as any);
    expect(await service.hasActiveEntitlement('user-1', Entitlement.AI)).toBe(false);
  });

  it('denies once the current period has already ended (stale/unrenewed subscription)', async () => {
    const subscriptions = {
      getActiveForUser: jest.fn().mockResolvedValue({
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: new Date(Date.now() - HOUR),
        plan: { features: { ai: true } },
      }),
    };
    const service = new EntitlementService(subscriptions as any);
    expect(await service.hasActiveEntitlement('user-1', Entitlement.AI)).toBe(false);
  });

  it('denies when the subscribed plan does not include the requested feature flag', async () => {
    const subscriptions = {
      getActiveForUser: jest.fn().mockResolvedValue({
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: new Date(Date.now() + HOUR),
        plan: { features: {} },
      }),
    };
    const service = new EntitlementService(subscriptions as any);
    expect(await service.hasActiveEntitlement('user-1', Entitlement.AI)).toBe(false);
  });
});
