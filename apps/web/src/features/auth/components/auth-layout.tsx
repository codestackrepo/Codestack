import type { ReactNode } from 'react';
import { GraduationCap, Trophy, Zap } from 'lucide-react';
import { Logo } from '@/components/shared/logo';

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

/**
 * Split-panel auth shell (revamp, eGov-login reference): an enriched violet
 * brand panel with feature rows on the left, a card-wrapped form on the right.
 * No grid backdrop — a soft violet glow instead. The brand panel is hidden below lg.
 */
export function AuthLayout({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <div className="sidebar-surface glow-violet relative hidden flex-col justify-between overflow-hidden p-10 text-sidebar-foreground lg:flex">
        <div className="relative animate-fade-in-up">
          <Logo wordmarkClassName="text-white" />
        </div>

        <div className="relative max-w-md space-y-8">
          <div className="space-y-4">
            <span
              className="animate-fade-in-up inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/90 ring-1 ring-white/15"
              style={{ animationDelay: '60ms' }}
            >
              <span className="size-1.5 rounded-full bg-success" />
              Learn. Practice. Grow.
            </span>
            <h2
              className="animate-fade-in-up font-heading text-4xl leading-[1.1] font-bold text-balance text-white"
              style={{ animationDelay: '120ms' }}
            >
              Learn to code by solving real problems.
            </h2>
          </div>

          <ul className="space-y-4">
            {FEATURES.map((f, i) => (
              <li
                key={f.title}
                className="animate-fade-in-up flex items-start gap-3.5"
                style={{ animationDelay: `${180 + i * 80}ms` }}
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-sidebar-primary ring-1 ring-white/15">
                  <f.icon className="size-5" />
                </span>
                <div className="leading-snug">
                  <p className="font-semibold text-white">{f.title}</p>
                  <p className="text-sm text-sidebar-foreground/70">{f.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-sidebar-foreground/60">
          © {new Date().getFullYear()} CodeStack · Sandboxed judging · Built for learners
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-background p-6">
        <div className="animate-fade-in-up w-full max-w-sm">
          <div className="flex justify-center pb-6 lg:hidden">
            <Logo />
          </div>
          <div className="rounded-2xl border border-border bg-card p-6 shadow-soft-lg sm:p-8">
            <div className="space-y-1.5 pb-6">
              <h1 className="font-heading text-2xl font-bold tracking-tight">{title}</h1>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
