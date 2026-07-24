import { useMemo } from 'react';
import type { CSSProperties } from 'react';

const COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--success)',
];

/**
 * Lightweight, dependency-free confetti burst for the Accepted moment (§13.5).
 * Pieces fan out from the center on the `confetti-out` keyframe; the reduced-
 * motion guard collapses the animation so it never distracts. Give it a `key`
 * (e.g. the submission id) so it re-mounts and replays per accepted submission.
 */
export function AcceptedBurst({ pieces = 16 }: { pieces?: number }) {
  const items = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => {
        const angle = (Math.PI * 2 * i) / pieces + Math.random() * 0.5;
        const dist = 60 + Math.random() * 70;
        const style: CSSProperties = {
          // travel outward + slight upward bias, with per-piece rotation
          ['--cx' as string]: `${Math.cos(angle) * dist}px`,
          ['--cy' as string]: `${Math.sin(angle) * dist - 30}px`,
          ['--cr' as string]: `${Math.random() * 540 - 270}deg`,
          backgroundColor: COLORS[i % COLORS.length],
          width: `${6 + Math.random() * 5}px`,
          height: `${6 + Math.random() * 5}px`,
          borderRadius: i % 3 === 0 ? '9999px' : '2px',
          animationDelay: `${Math.random() * 60}ms`,
        };
        return <span key={i} className="confetti-piece absolute" style={style} />;
      }),
    [pieces],
  );

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
    >
      {items}
    </div>
  );
}
