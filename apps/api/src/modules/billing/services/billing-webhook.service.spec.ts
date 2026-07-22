import { FakeStripeProvider } from '../payment/providers/fake-stripe.provider';
import { WebhookEventStatus } from '../enums/billing.enums';
import { BillingWebhookService, WebhookSignatureError } from './billing-webhook.service';

type MockRepo = {
  create: jest.Mock;
  save: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  findOneBy: jest.Mock;
};

function mockRepo(): MockRepo {
  return {
    create: jest.fn((x) => x),
    save: jest.fn((x) => Promise.resolve(x)),
    insert: jest.fn(),
    update: jest.fn(),
    findOneBy: jest.fn(),
  };
}

function uniqueViolation(): Error & { code: string } {
  return Object.assign(new Error('duplicate key value violates unique constraint'), {
    code: '23505',
  });
}

describe('BillingWebhookService', () => {
  let events: MockRepo;
  let subscriptionsRepo: MockRepo;
  let invoicesRepo: MockRepo;
  let subscriptionService: { upsertFromSnapshot: jest.Mock };
  let provider: FakeStripeProvider;
  let service: BillingWebhookService;

  beforeEach(() => {
    events = mockRepo();
    subscriptionsRepo = mockRepo();
    invoicesRepo = mockRepo();
    subscriptionService = { upsertFromSnapshot: jest.fn().mockResolvedValue({}) };
    provider = new FakeStripeProvider();
    service = new BillingWebhookService(
      provider,
      subscriptionService as any,
      events as any,
      subscriptionsRepo as any,
      invoicesRepo as any,
    );
  });

  it('rejects a webhook with an invalid signature before touching the DB, as a WebhookSignatureError', async () => {
    await expect(service.handle(Buffer.from('{}'), 'invalid')).rejects.toThrow(
      WebhookSignatureError,
    );
    expect(events.save).not.toHaveBeenCalled();
  });

  it('is a no-op on a redelivered event id (idempotency gate)', async () => {
    provider.queueWebhookEvent({ id: 'evt_1', type: 'checkout.session.completed', data: {} });
    events.save.mockRejectedValueOnce(uniqueViolation());

    await service.handle(Buffer.from('{}'), 'valid');

    expect(subscriptionService.upsertFromSnapshot).not.toHaveBeenCalled();
  });

  it('resolves the userId via the customer for checkout.session.completed and upserts the subscription', async () => {
    provider.seedCustomer('cus_1', 'user-1');
    provider.seedSubscription({
      id: 'sub_1',
      customerId: 'cus_1',
      status: 'active',
      priceId: 'price_monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(),
      cancelAtPeriodEnd: false,
    });
    provider.queueWebhookEvent({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { subscription: 'sub_1', customer: 'cus_1' },
    });

    await service.handle(Buffer.from('{}'), 'valid');

    expect(subscriptionService.upsertFromSnapshot).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ id: 'sub_1' }),
    );
    expect(events.update).toHaveBeenCalledWith(
      { provider: 'stripe', eventId: 'evt_1' },
      expect.objectContaining({ status: WebhookEventStatus.PROCESSED }),
    );
  });

  it('reuses the userId from an existing local row for customer.subscription.updated, without an extra customer lookup', async () => {
    subscriptionsRepo.findOneBy.mockResolvedValue({ userId: 'user-2' });
    provider.seedSubscription({
      id: 'sub_2',
      customerId: 'cus_2',
      status: 'past_due',
      priceId: 'price_monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(),
      cancelAtPeriodEnd: false,
    });
    provider.queueWebhookEvent({
      id: 'evt_2',
      type: 'customer.subscription.updated',
      data: { id: 'sub_2', customer: 'cus_2' },
    });
    const getCustomerUserIdSpy = jest.spyOn(provider, 'getCustomerUserId');

    await service.handle(Buffer.from('{}'), 'valid');

    expect(getCustomerUserIdSpy).not.toHaveBeenCalled();
    expect(subscriptionService.upsertFromSnapshot).toHaveBeenCalledWith(
      'user-2',
      expect.objectContaining({ id: 'sub_2' }),
    );
  });

  it('falls back to the customer lookup for customer.subscription.updated when no local row exists yet (out-of-order delivery)', async () => {
    subscriptionsRepo.findOneBy.mockResolvedValue(null);
    provider.seedCustomer('cus_3', 'user-3');
    provider.seedSubscription({
      id: 'sub_3',
      customerId: 'cus_3',
      status: 'active',
      priceId: 'price_monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(),
      cancelAtPeriodEnd: false,
    });
    provider.queueWebhookEvent({
      id: 'evt_3',
      type: 'customer.subscription.created',
      data: { id: 'sub_3', customer: 'cus_3' },
    });

    await service.handle(Buffer.from('{}'), 'valid');

    expect(subscriptionService.upsertFromSnapshot).toHaveBeenCalledWith(
      'user-3',
      expect.objectContaining({ id: 'sub_3' }),
    );
  });

  it('silently ignores unrecognized event types', async () => {
    provider.queueWebhookEvent({ id: 'evt_4', type: 'invoice.finalized', data: {} });

    await service.handle(Buffer.from('{}'), 'valid');

    expect(subscriptionService.upsertFromSnapshot).not.toHaveBeenCalled();
    expect(events.update).toHaveBeenCalledWith(
      { provider: 'stripe', eventId: 'evt_4' },
      expect.objectContaining({ status: WebhookEventStatus.PROCESSED }),
    );
  });

  it('marks the event FAILED and rethrows when dispatch throws', async () => {
    subscriptionsRepo.findOneBy.mockResolvedValue({ userId: 'user-1' });
    provider.queueWebhookEvent({
      id: 'evt_5',
      type: 'customer.subscription.updated',
      data: { id: 'sub_missing', customer: 'cus_1' },
    });
    // No subscription seeded for 'sub_missing' -> getSubscription() throws.

    await expect(service.handle(Buffer.from('{}'), 'valid')).rejects.toThrow();

    expect(events.update).toHaveBeenCalledWith(
      { provider: 'stripe', eventId: 'evt_5' },
      expect.objectContaining({ status: WebhookEventStatus.FAILED }),
    );
  });

  it('records a paid invoice, linking it to the local subscription row when one exists', async () => {
    provider.seedCustomer('cus_9', 'user-9');
    subscriptionsRepo.findOneBy.mockResolvedValue({ id: 'local-sub-9' });
    provider.queueWebhookEvent({
      id: 'evt_inv_1',
      type: 'invoice.paid',
      data: {
        id: 'in_1',
        customer: 'cus_9',
        amount_paid: 1900,
        currency: 'usd',
        status: 'paid',
        period_start: 1_700_000_000,
        period_end: 1_702_592_000,
        hosted_invoice_url: 'https://stripe.test/invoice/in_1',
        parent: { subscription_details: { subscription: 'sub_9' } },
      },
    });

    await service.handle(Buffer.from('{}'), 'valid');

    expect(invoicesRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-9', providerInvoiceId: 'in_1' }),
    );
    const saved = invoicesRepo.save.mock.calls[0][0];
    expect(saved.subscriptionId).toBe('local-sub-9');
    expect(saved.amountPaid).toBe(1900);
    expect(saved.hostedInvoiceUrl).toBe('https://stripe.test/invoice/in_1');
  });

  it('ignores an invoice event when the customer cannot be resolved to a user', async () => {
    provider.queueWebhookEvent({
      id: 'evt_inv_2',
      type: 'invoice.paid',
      data: {
        id: 'in_2',
        customer: 'cus_unknown',
        amount_paid: 1900,
        currency: 'usd',
        status: 'paid',
        period_start: 1_700_000_000,
        period_end: 1_702_592_000,
      },
    });

    await service.handle(Buffer.from('{}'), 'valid');

    expect(invoicesRepo.save).not.toHaveBeenCalled();
  });
});
