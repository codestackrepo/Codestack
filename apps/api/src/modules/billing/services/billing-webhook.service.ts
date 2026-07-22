import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from '../entities/invoice.entity';
import { Subscription } from '../entities/subscription.entity';
import { WebhookEvent } from '../entities/webhook-event.entity';
import { InvoiceStatus, WebhookEventStatus } from '../enums/billing.enums';
import {
  PAYMENT_PROVIDER,
  ParsedWebhookEvent,
  PaymentProvider,
} from '../payment/payment-provider.interface';
import { SubscriptionService } from './subscription.service';

const PROVIDER = 'stripe';
const POSTGRES_UNIQUE_VIOLATION = '23505';

/** Thrown when the inbound webhook fails signature verification — a malformed request, not a server fault. */
export class WebhookSignatureError extends Error {}

interface CheckoutSessionLike {
  subscription?: string | null;
  customer?: string | null;
}

interface SubscriptionLike {
  id: string;
  customer: string;
}

const INVOICE_STATUS_MAP: Record<string, InvoiceStatus> = {
  paid: InvoiceStatus.PAID,
  open: InvoiceStatus.OPEN,
  draft: InvoiceStatus.OPEN,
  uncollectible: InvoiceStatus.UNCOLLECTIBLE,
  void: InvoiceStatus.VOID,
};

interface InvoiceLike {
  id: string;
  customer: string;
  amount_paid: number;
  currency: string;
  status: string;
  period_start: number;
  period_end: number;
  hosted_invoice_url?: string | null;
  parent?: {
    subscription_details?: { subscription?: string | { id: string } | null } | null;
  } | null;
}

/**
 * Verifies + idempotently dedupes inbound Stripe webhooks, then dispatches
 * to the subscription state machine. Every subscription mutation re-fetches
 * the CURRENT state via `PaymentProvider.getSubscription()` rather than
 * trusting the webhook payload's embedded snapshot — this is what makes
 * dispatch order-independent (see SubscriptionService).
 */
@Injectable()
export class BillingWebhookService {
  private readonly logger = new Logger(BillingWebhookService.name);

  constructor(
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly subscriptionService: SubscriptionService,
    @InjectRepository(WebhookEvent) private readonly events: Repository<WebhookEvent>,
    @InjectRepository(Subscription) private readonly subscriptions: Repository<Subscription>,
    @InjectRepository(Invoice) private readonly invoices: Repository<Invoice>,
  ) {}

  async handle(rawBody: Buffer, signature: string): Promise<void> {
    let parsed: ParsedWebhookEvent;
    try {
      parsed = this.provider.verifyWebhook(rawBody, signature);
    } catch (err) {
      throw new WebhookSignatureError((err as Error).message);
    }

    const inserted = await this.tryRecordEvent(parsed);
    if (!inserted) {
      this.logger.log(`Ignoring redelivered webhook event ${parsed.id} (${parsed.type})`);
      return;
    }

    try {
      await this.dispatch(parsed);
      await this.events.update(
        { provider: PROVIDER, eventId: parsed.id },
        { status: WebhookEventStatus.PROCESSED, processedAt: new Date() },
      );
    } catch (err) {
      await this.events.update(
        { provider: PROVIDER, eventId: parsed.id },
        { status: WebhookEventStatus.FAILED, processedAt: new Date() },
      );
      throw err;
    }
  }

  /** Returns false (no-op) when this event id was already recorded — the idempotency gate. */
  private async tryRecordEvent(parsed: ParsedWebhookEvent): Promise<boolean> {
    try {
      const row = this.events.create({
        provider: PROVIDER,
        eventId: parsed.id,
        type: parsed.type,
        payload: parsed.data as Record<string, unknown>,
      });
      await this.events.save(row);
      return true;
    } catch (err) {
      if (this.isUniqueViolation(err)) return false;
      throw err;
    }
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION
    );
  }

  private async dispatch(parsed: ParsedWebhookEvent): Promise<void> {
    switch (parsed.type) {
      case 'checkout.session.completed':
        return this.handleCheckoutCompleted(parsed.data as CheckoutSessionLike);
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        return this.handleSubscriptionMutated(parsed.data as SubscriptionLike);
      case 'invoice.paid':
      case 'invoice.payment_failed':
        return this.handleInvoice(parsed.data as InvoiceLike);
      default:
        // Stripe sends many event types we don't act on (invoice.finalized,
        // payment_method.attached, ...). Silently ignoring unrecognized
        // types (rather than rejecting) keeps this endpoint forward-compatible
        // as Stripe adds new event types to the same webhook destination.
        return;
    }
  }

  private async handleCheckoutCompleted(session: CheckoutSessionLike): Promise<void> {
    if (!session.subscription || !session.customer) {
      this.logger.warn('checkout.session.completed had no subscription/customer — ignoring');
      return;
    }
    const userId = await this.provider.getCustomerUserId(session.customer);
    if (!userId) {
      this.logger.warn(`Cannot resolve a userId for customer ${session.customer} — ignoring`);
      return;
    }
    const snapshot = await this.provider.getSubscription(session.subscription);
    await this.subscriptionService.upsertFromSnapshot(userId, snapshot);
  }

  private async handleSubscriptionMutated(raw: SubscriptionLike): Promise<void> {
    const existing = await this.subscriptions.findOneBy({ providerSubscriptionId: raw.id });
    const userId = existing?.userId ?? (await this.provider.getCustomerUserId(raw.customer));
    if (!userId) {
      this.logger.warn(`Cannot resolve a userId for subscription ${raw.id} — ignoring`);
      return;
    }
    const snapshot = await this.provider.getSubscription(raw.id);
    await this.subscriptionService.upsertFromSnapshot(userId, snapshot);
  }

  private async handleInvoice(invoice: InvoiceLike): Promise<void> {
    const userId = await this.provider.getCustomerUserId(invoice.customer);
    if (!userId) {
      this.logger.warn(`Cannot resolve a userId for invoice ${invoice.id} — ignoring`);
      return;
    }

    const subRef = invoice.parent?.subscription_details?.subscription;
    const subscriptionId = typeof subRef === 'string' ? subRef : (subRef?.id ?? null);
    const localSub = subscriptionId
      ? await this.subscriptions.findOneBy({ providerSubscriptionId: subscriptionId })
      : null;

    const existing = await this.invoices.findOneBy({ providerInvoiceId: invoice.id });
    const row = existing ?? this.invoices.create({ userId, providerInvoiceId: invoice.id });

    row.subscriptionId = localSub?.id ?? null;
    row.amountPaid = invoice.amount_paid;
    row.currency = invoice.currency;
    row.status = INVOICE_STATUS_MAP[invoice.status] ?? InvoiceStatus.OPEN;
    row.periodStart = new Date(invoice.period_start * 1000);
    row.periodEnd = new Date(invoice.period_end * 1000);
    row.hostedInvoiceUrl = invoice.hosted_invoice_url ?? null;

    await this.invoices.save(row);
  }
}
