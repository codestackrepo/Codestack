import { cn } from '@/lib/utils';

interface LogoProps {
  /** `full` renders the mark + wordmark; `mark` renders just the badge. */
  variant?: 'full' | 'mark';
  /** Sizing / styling for the mark badge (default `size-8`). */
  className?: string;
  /** Extra classes for the wordmark text (color is inherited from the parent). */
  wordmarkClassName?: string;
  /** Color class for the "Stack" accent. Override on dark surfaces where the
   *  default violet primary would be too dark. */
  accentClassName?: string;
}

/**
 * CodeStack brand lockup. The mark is a self-contained SVG: a violet→magenta
 * gradient rounded badge with a `</>` code glyph — reads on any surface and
 * matches the purple-forward brand. The wordmark is themed HTML text.
 */
export function Logo({
  variant = 'full',
  className,
  wordmarkClassName,
  accentClassName = 'text-primary',
}: LogoProps) {
  const mark = (
    <span className={cn('inline-flex shrink-0 items-center justify-center', 'size-8', className)}>
      <svg
        viewBox="0 0 32 32"
        role="img"
        aria-label="CodeStack"
        className="size-full drop-shadow-[0_2px_6px_hsl(262_70%_45%/0.4)]"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="cs-mark" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7C5CFF" />
            <stop offset="1" stopColor="#C15CEC" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill="url(#cs-mark)" />
        {/* subtle top highlight for depth */}
        <rect width="32" height="16" rx="9" fill="white" fillOpacity="0.08" />
        {/* </> code glyph */}
        <path
          d="M12.4 10.8 L7.6 16 L12.4 21.2"
          stroke="white"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M19.6 10.8 L24.4 16 L19.6 21.2"
          stroke="white"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M17.7 9 L14.3 23"
          stroke="white"
          strokeOpacity="0.9"
          strokeWidth="2.3"
          strokeLinecap="round"
        />
      </svg>
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
        Code<span className={accentClassName}>Stack</span>
      </span>
    </span>
  );
}
