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
    backgroundColor: `color-mix(in oklab, ${accent} 15%, var(--card))`,
    color: accent,
    boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${accent} 30%, transparent)`,
  };
  const washStyle: CSSProperties = {
    background: `radial-gradient(circle, color-mix(in oklab, ${accent} 32%, transparent), transparent 70%)`,
  };

  return (
    <Card className={cn('hover-3d group relative overflow-hidden p-5', className)}>
      {/* Soft accent wash behind the icon — brightens on hover for a classy lift. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-10 -right-10 size-32 rounded-full opacity-55 blur-2xl transition-opacity duration-300 group-hover:opacity-90"
        style={washStyle}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {label}
          </p>
          <p className="font-heading text-3xl font-bold tracking-tight text-foreground tabular-nums">
            {value}
          </p>
          {hint && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-1.5 shrink-0 rounded-full" style={{ background: accent }} />
              {hint}
            </p>
          )}
        </div>
        {icon && (
          <div
            className="flex size-12 shrink-0 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-105"
            style={chipStyle}
          >
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
