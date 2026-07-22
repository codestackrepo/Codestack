import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { Check } from 'lucide-react';
import { useCheckout } from '../hooks/use-billing';
import { formatMoney, humanizeFeature, intervalLabel } from '../lib/format';
import type { PlanResponseDto } from '../types';

function PlanCard({
  plan,
  isCurrent,
  onSubscribe,
  isSubscribing,
  disableActions,
}: {
  plan: PlanResponseDto;
  isCurrent: boolean;
  onSubscribe: (planCode: string) => void;
  isSubscribing: boolean;
  disableActions: boolean;
}) {
  const enabledFeatures = Object.entries(plan.features)
    .filter(([, on]) => on)
    .map(([key]) => key);

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>{plan.name}</CardTitle>
        <CardDescription>
          <span className="text-2xl font-semibold text-foreground">
            {formatMoney(plan.priceMinorUnits, plan.currency)}
          </span>{' '}
          / {intervalLabel(plan.interval)}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        {enabledFeatures.length > 0 ? (
          <ul className="space-y-2 text-sm">
            {enabledFeatures.map((key) => (
              <li key={key} className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>{humanizeFeature(key)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Core CodeStack access.</p>
        )}
      </CardContent>
      <CardFooter>
        {isCurrent ? (
          <Button variant="outline" className="w-full" disabled>
            Current plan
          </Button>
        ) : (
          <Button
            className="w-full bg-brand text-brand-foreground hover:bg-brand/90"
            disabled={disableActions}
            onClick={() => onSubscribe(plan.code)}
          >
            {isSubscribing ? 'Redirecting…' : 'Subscribe'}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

export function PlansGrid({
  plans,
  isLoading,
  currentPlanCode,
}: {
  plans: PlanResponseDto[] | undefined;
  isLoading: boolean;
  currentPlanCode: string | null;
}) {
  const checkout = useCheckout();

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Plans</h2>
        <p className="text-sm text-muted-foreground">
          Choose a plan that fits how you use CodeStack.
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full rounded-xl" />
          ))}
        </div>
      ) : !plans || plans.length === 0 ? (
        <EmptyState
          title="No plans available"
          description="There are no subscription plans to show right now."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isCurrent={!!currentPlanCode && plan.code === currentPlanCode}
              onSubscribe={(code) => checkout.mutate(code)}
              isSubscribing={checkout.isPending && checkout.variables === plan.code}
              disableActions={checkout.isPending}
            />
          ))}
        </div>
      )}
    </section>
  );
}
