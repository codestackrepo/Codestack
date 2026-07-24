import type { CSSProperties } from 'react';
import { GraduationCap, Trophy, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/shared/logo';

// Deterministic twinkling-star field (computed once at module load).
const STARS: CSSProperties[] = Array.from({ length: 22 }, (_, i) => {
  const x = (i * 61) % 97;
  const y = (i * 37) % 93;
  const s = 1 + ((i * 7) % 3);
  return {
    left: `${x}%`,
    top: `${y}%`,
    width: `${s}px`,
    height: `${s}px`,
    animationDelay: `${(i % 8) * 0.45}s`,
    animationDuration: `${3 + (i % 4)}s`,
  };
});

const FEATURES = [
  {
    icon: Zap,
    title: 'Judged in seconds',
    desc: 'Sandboxed run + submit with instant, per-testcase verdicts.',
  },
  {
    icon: GraduationCap,
    title: 'Classrooms & assignments',
    desc: 'Cohorts, timed tests, MCQs, and a live gradebook.',
  },
  {
    icon: Trophy,
    title: 'Practice that sticks',
    desc: 'Points, daily streaks, and a contribution heatmap.',
  },
];

/** Enriched violet brand panel used on the auth slide-swap (dark, no grid). */
export function AuthBrandPanel() {
  return (
    <div className="sidebar-surface glow-violet relative flex h-full flex-col justify-between overflow-hidden p-10 text-sidebar-foreground xl:p-12">
      {/* Ambient movement: drifting light orbs + twinkling stars. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="orb-float absolute -top-16 right-6 size-72 rounded-full opacity-55 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--primary), transparent 70%)' }}
        />
        <div
          className="orb-float absolute bottom-4 -left-10 size-64 rounded-full opacity-45 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--chart-4), transparent 70%)', animationDelay: '3s', animationDuration: '20s' }}
        />
        {STARS.map((s, i) => (
          <span key={i} className="twinkle absolute rounded-full bg-white" style={s} />
        ))}
      </div>

      <div className="relative">
        <Link to="/" title="CodeStack home">
          <Logo wordmarkClassName="text-white" accentClassName="text-[hsl(262_78%_82%)]" />
        </Link>
      </div>

      <div className="relative max-w-md space-y-8">
        <div className="space-y-4">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white ring-1 ring-white/25">
            <span className="size-1.5 rounded-full bg-success" />
            Learn. Practice. Grow.
          </span>
          <h2 className="font-heading text-4xl leading-[1.1] font-bold text-balance text-white xl:text-[2.75rem]">
            Learn to code by solving real problems.
          </h2>
        </div>

        <ul className="space-y-4">
          {FEATURES.map((f) => (
            <li key={f.title} className="flex items-start gap-3.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/15 text-[hsl(263_90%_85%)] ring-1 ring-white/25">
                <f.icon className="size-5" />
              </span>
              <div className="leading-snug">
                <p className="font-semibold text-white">{f.title}</p>
                <p className="text-sm text-sidebar-foreground/80">{f.desc}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <p className="relative text-xs text-sidebar-foreground/60">
        © {new Date().getFullYear()} CodeStack · Sandboxed judging · Built for learners
      </p>
    </div>
  );
}
