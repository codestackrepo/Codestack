import { cn } from '@/lib/utils';

interface LogoProps {
  /** `full` renders the mark + wordmark; `mark` renders just the badge. */
  variant?: 'full' | 'mark';
  /** Sizing / styling for the mark badge (default `size-8`). */
  className?: string;
  /** Extra classes for the wordmark text (color is inherited from the parent). */
  wordmarkClassName?: string;
}

/**
 * CodeStack brand lockup. The circular mark comes from the real brand asset
 * (`/brand/mark-256.png`); it's clipped to a disc with a slight scale so the
 * asset's white corners fall outside the clip, letting it sit cleanly on any
 * surface (light card, navy sidebar). The wordmark is themed HTML text that
 * inherits `currentColor`, so it adapts to light/dark automatically.
 */
export function Logo({ variant = 'full', className, wordmarkClassName }: LogoProps) {
  const mark = (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-black/5',
        'size-8',
        className,
      )}
    >
      <img
        src="/brand/mark-256.png"
        alt="CodeStack"
        width={256}
        height={256}
        className="size-full scale-[1.12] object-cover"
      />
    </span>
  );

  if (variant === 'mark') return mark;

  return (
    <span className="inline-flex items-center gap-2.5">
      {mark}
      <span
        className={cn(
          'font-heading text-lg font-bold tracking-tight text-current',
          wordmarkClassName,
        )}
      >
        Code<span className="text-brand">Stack</span>
      </span>
    </span>
  );
}
