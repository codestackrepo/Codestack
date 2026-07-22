import { SubscriptionStatus } from '../enums/billing.enums';
import { FakeStripeProvider } from '../payment/providers/fake-stripe.provider';
import { SubscriptionService } from './subscription.service';

type MockRepo = {
  findOneBy: jest.Mock;
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
};

function mockRepo(): MockRepo {
  return {
    findOneBy: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((x) => x),
    save: jest.fn((x) => Promise.resolve(x)),
  };
}

const snapshot = (
  overrides: Partial<Parameters<SubscriptionService['upsertFromSnapshot']>[1]> = {},
) => ({
  id: 'sub_stripe_1',
  customerId: 'cus_1',
  status: 'active',
  priceId: 'price_monthly',
  currentPeriodStart: new Date('2026-01-01T00:00:00Z'),
  currentPeriodEnd: new Date('2026-02-01T00:00:00Z'),
  cancelAtPeriodEnd: false,
  ...overrides,
});

describe('SubscriptionService.upsertFromSnapshot', () => {
  let subscriptions: MockRepo;
  let plans: MockRepo;
  let service: SubscriptionService;

  beforeEach(() => {
    subscriptions = mockRepo();
    plans = mockRepo();
    plans.findOneBy.mockResolvedValue({ id: 'plan-1', stripePriceId: 'price_monthly' });
    service = new SubscriptionService(new FakeStripeProvider(), subscriptions as any, plans as any);
  });

  it('creates a new row when no subscription with this providerSubscriptionId exists', async () => {
    subscriptions.findOneBy.mockResolvedValue(null);

    await service.upsertFromSnapshot('user-1', snapshot());

    expect(subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        provider: 'stripe',
        providerSubscriptionId: 'sub_stripe_1',
      }),
    );
    const saved = subscriptions.save.mock.calls[0][0];
    expect(saved.status).toBe(SubscriptionStatus.ACTIVE);
    expect(saved.planId).toBe('plan-1');
  });

  it('updates the existing row in place when the providerSubscriptionId already exists (idempotent upsert)', async () => {
    const existing = { id: 'local-1', userId: 'user-1', providerSubscriptionId: 'sub_stripe_1' };
    subscriptions.findOneBy.mockResolvedValue(existing);

    const result = await service.upsertFromSnapshot('user-1', snapshot({ status: 'past_due' }));

    expect(subscriptions.create).not.toHaveBeenCalled();
    expect(result.id).toBe('local-1');
    expect(result.status).toBe(SubscriptionStatus.PAST_DUE);
  });

  it('throws when no Plan is configured for the snapshot price id', async () => {
    plans.findOneBy.mockResolvedValue(null);
    subscriptions.findOneBy.mockResolvedValue(null);

    await expect(service.upsertFromSnapshot('user-1', snapshot())).rejects.toThrow(/No Plan/);
  });

  it.each([
    ['trialing', SubscriptionStatus.TRIALING],
    ['active', SubscriptionStatus.ACTIVE],
    ['past_due', SubscriptionStatus.PAST_DUE],
    ['canceled', SubscriptionStatus.CANCELED],
    ['unpaid', SubscriptionStatus.CANCELED],
    ['incomplete_expired', SubscriptionStatus.CANCELED],
    ['incomplete', SubscriptionStatus.INCOMPLETE],
    ['some_future_stripe_status', SubscriptionStatus.INCOMPLETE],
  ])('maps Stripe status "%s" to %s', async (stripeStatus, expected) => {
    subscriptions.findOneBy.mockResolvedValue(null);
    const result = await service.upsertFromSnapshot('user-1', snapshot({ status: stripeStatus }));
    expect(result.status).toBe(expected);
  });
});

describe('SubscriptionService.cancel', () => {
  it('calls the provider and sets cancelAtPeriodEnd on the active subscription', async () => {
    const subscriptions = mockRepo();
    const plans = mockRepo();
    const provider = new FakeStripeProvider();
    const cancelSpy = jest.spyOn(provider, 'cancelSubscription');
    const active = {
      id: 'local-1',
      providerSubscriptionId: 'sub_stripe_1',
      cancelAtPeriodEnd: false,
    };
    subscriptions.findOne.mockResolvedValue(active);

    const service = new SubscriptionService(provider, subscriptions as any, plans as any);
    const result = await service.cancel('user-1');

    expect(cancelSpy).toHaveBeenCalledWith('sub_stripe_1');
    expect(result.cancelAtPeriodEnd).toBe(true);
  });

  it('throws NotFoundException when the user has no active subscription', async () => {
    const subscriptions = mockRepo();
    const plans = mockRepo();
    subscriptions.findOne.mockResolvedValue(null);

    const service = new SubscriptionService(
      new FakeStripeProvider(),
      subscriptions as any,
      plans as any,
    );
    await expect(service.cancel('user-1')).rejects.toThrow('No active subscription to cancel');
  });
});
