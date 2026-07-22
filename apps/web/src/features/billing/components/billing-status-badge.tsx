import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { InvoiceStatus, SubscriptionStatus } from '../types';

const SUBSCRIPTION_STYLES: Record<SubscriptionStatus, string> = {
  [SubscriptionStatus.INCOMPLETE]: 'bg-muted text-muted-foreground',
  [SubscriptionStatus.TRIALING]: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  [SubscriptionStatus.ACTIVE]: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  [SubscriptionStatus.PAST_DUE]: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  [SubscriptionStatus.CANCELED]: 'bg-red-500/15 text-red-600 dark:text-red-400',
};

const SUBSCRIPTION_LABEL: Record<SubscriptionStatus, string> = {
  [SubscriptionStatus.INCOMPLETE]: 'Incomplete',
  [SubscriptionStatus.TRIALING]: 'Trialing',
  [SubscriptionStatus.ACTIVE]: 'Active',
  [SubscriptionStatus.PAST_DUE]: 'Past due',
  [SubscriptionStatus.CANCELED]: 'Canceled',
};

export function SubscriptionStatusBadge({
  status,
  className,
}: {
  status: SubscriptionStatus;
  className?: string;
}) {
  return (
    <Badge className={cn('border-transparent font-medium', SUBSCRIPTION_STYLES[status], className)}>
      {SUBSCRIPTION_LABEL[status] ?? status}
    </Badge>
  );
}

const INVOICE_STYLES: Record<InvoiceStatus, string> = {
  [InvoiceStatus.PAID]: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  [InvoiceStatus.OPEN]: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  [InvoiceStatus.UNCOLLECTIBLE]: 'bg-red-500/15 text-red-600 dark:text-red-400',
  [InvoiceStatus.VOID]: 'bg-muted text-muted-foreground',
};

const INVOICE_LABEL: Record<InvoiceStatus, string> = {
  [InvoiceStatus.PAID]: 'Paid',
  [InvoiceStatus.OPEN]: 'Open',
  [InvoiceStatus.UNCOLLECTIBLE]: 'Uncollectible',
  [InvoiceStatus.VOID]: 'Void',
};

export function InvoiceStatusBadge({
  status,
  className,
}: {
  status: InvoiceStatus;
  className?: string;
}) {
  return (
    <Badge className={cn('border-transparent font-medium', INVOICE_STYLES[status], className)}>
      {INVOICE_LABEL[status] ?? status}
    </Badge>
  );
}
