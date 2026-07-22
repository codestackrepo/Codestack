import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { CalendarClock, Sparkles } from 'lucide-react';
import { SubscriptionStatusBadge } from './billing-status-badge';
import { useCancelSubscription } from '../hooks/use-billing';
import { formatDate } from '../lib/format';
import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  SubscriptionStatus,
  type SubscriptionResponseDto,
} from '../types';

function planLabel(subscription: SubscriptionResponseDto): string {
  if (!subscription.planCode) return 'Your plan';
  return subscription.planCode.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Prefix for the period-end date line, for statuses where "Renews on" is wrong. */
const PERIOD_LABEL: Partial<Record<SubscriptionStatus, string>> = {
  [SubscriptionStatus.PAST_DUE]: 'Current period ends ',
  [SubscriptionStatus.INCOMPLETE]: 'Current period ends ',
  [SubscriptionStatus.CANCELED]: 'Ended on ',
};

export function SubscriptionCard({
  subscription,
  isLoading,
}: {
  subscription: SubscriptionResponseDto | null | undefined;
  isLoading: boolean;
}) {
  const cancel = useCancelSubscription();

  const isActive = !!subscription && ACTIVE_SUBSCRIPTION_STATUSES.includes(subscription.status);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Current subscription</CardTitle>
        <CardDescription>Manage your CodeStack plan and renewal.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
        ) : subscription ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-semibold">{planLabel(subscription)}</span>
                <SubscriptionStatusBadge status={subscription.status} />
              </div>

              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <CalendarClock className="size-4" />
                {PERIOD_LABEL[subscription.status] ??
                  (subscription.cancelAtPeriodEnd ? 'Access ends on ' : 'Renews on ')}
                <span className="font-medium text-foreground">
                  {formatDate(subscription.currentPeriodEnd)}
                </span>
              </p>

              {isActive && subscription.cancelAtPeriodEnd && (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  Your subscription is set to cancel at the end of the current period.
                </p>
              )}
              {subscription.status === SubscriptionStatus.PAST_DUE && (
                <p className="text-sm text-destructive">
                  Your last payment failed. Re-subscribe below to keep premium access.
                </p>
              )}
              {subscription.status === SubscriptionStatus.INCOMPLETE && (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  Your checkout is unfinished — complete payment below to activate your plan.
                </p>
              )}
              {subscription.status === SubscriptionStatus.CANCELED && (
                <p className="text-sm text-muted-foreground">
                  This plan has ended and you&apos;re on the free tier. Re-subscribe below any time.
                </p>
              )}
            </div>

            {isActive && !subscription.cancelAtPeriodEnd && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    Cancel subscription
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel your subscription?</AlertDialogTitle>
                    <AlertDialogDescription>
                      You&apos;ll keep access until {formatDate(subscription.currentPeriodEnd)}.
                      After that your plan will not renew and you&apos;ll move to the free tier. You
                      can resubscribe at any time.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={cancel.isPending}>Keep plan</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      disabled={cancel.isPending}
                      onClick={(e) => {
                        // Keep the dialog logic in our hands so a failed request
                        // doesn't leave the UI thinking it succeeded.
                        e.preventDefault();
                        cancel.mutate();
                      }}
                    >
                      {cancel.isPending ? 'Cancelling…' : 'Cancel subscription'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Sparkles className="size-4" />
            </span>
            <div className="space-y-1">
              <p className="font-medium">You&apos;re on the free tier</p>
              <p className="text-sm text-muted-foreground">
                Upgrade to a paid plan below to unlock premium features like the AI assistant.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
