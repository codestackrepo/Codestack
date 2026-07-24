import type { CSSProperties, ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  hint?: ReactNode;
  /**
   * Icon-chip accent as a CSS color (e.g. `var(--chart-1)`, `var(--brand)`).
   * Rendered as a soft tint fill + saturated glyph — colorful like the reference
   * dashboards (§14.4). Defaults to the violet primary.
   */
  accent?: string;
  className?: string;
}

export function StatCard({
  label,
  value,
  icon,
  hint,
  accent = 'var(--primary)',
  className,
}: StatCardProps) {
  const chipStyle: CSSProperties = {
    backgroundColor: `color-mix(in oklab, ${accent} 14%, var(--card))`,
    color: accent,
  };

  return (
    <Card
      className={cn(
        'p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-soft-lg',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {label}
          </p>
          <p className="font-heading text-3xl font-bold text-foreground">{value}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {icon && (
          <div
            className="flex size-11 shrink-0 items-center justify-center rounded-xl"
            style={chipStyle}
          >
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
