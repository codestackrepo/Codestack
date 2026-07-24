import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Code2,
  GraduationCap,
  Sparkles,
  Terminal,
  Trophy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/shared/logo';
import { ThemeToggle } from '@/components/shared/theme-toggle';
import { useReveal } from '@/hooks/use-reveal';
import { useAuth } from '@/features/auth/context/auth-context';

/**
 * Public landing page at `/` (§14.1) — the only unauthenticated marketing
 * surface. Full-bleed, own slim top bar, calm dev-platform hero (not a gov
 * hero). Reuses the token system + motion layer; degrades cleanly under
 * reduced motion. Logged-in visitors get an "Open dashboard" CTA.
 */

type Feature = {
  icon: typeof Code2;
  title: string;
  desc: string;
  /** Icon-chip background + foreground (CSS color values). */
  bg: string;
  fg: string;
};

const CHIP = (hue: string) => ({
  bg: `color-mix(in oklab, ${hue} 90%, white 10%)`,
  fg: 'white',
});

const FEATURES: Feature[] = [
  {
    icon: Code2,
    title: 'Practice problems',
    desc: 'A judged problem catalog with instant verdicts, sample runs, and full submission history.',
    ...CHIP('var(--chart-1)'),
  },
  {
    icon: GraduationCap,
    title: 'Classrooms',
    desc: 'Organize cohorts, share problem sets, and keep every learner moving in one place.',
    ...CHIP('var(--chart-4)'),
  },
  {
    icon: ClipboardList,
    title: 'Assignments & tests',
    desc: 'Timed tests and multi-item assignments — coding, MCQ, and quizzes — with autosave.',
    ...CHIP('var(--chart-3)'),
  },
  {
    icon: Terminal,
    title: 'Code playground',
    desc: 'A sandbox to prototype in many languages without leaving the platform.',
    ...CHIP('var(--chart-5)'),
  },
  {
    icon: Trophy,
    title: 'Streaks & rewards',
    desc: 'Points, daily streaks, and a contribution heatmap that make consistent practice stick.',
    bg: 'var(--brand)',
    fg: 'var(--brand-foreground)',
  },
  {
    icon: BarChart3,
    title: 'Grading & insight',
    desc: 'A live gradebook and per-item review so educators see progress at a glance.',
    ...CHIP('var(--primary)'),
  },
];

const STEPS = [
  { n: '1', title: 'Pick a track', desc: 'Jump into practice problems or open an assignment from your classroom.' },
  { n: '2', title: 'Write & run', desc: 'Code in the editor, run against samples, and submit for an instant verdict.' },
  { n: '3', title: 'Build a streak', desc: 'Earn points, grow your streak, and watch your heatmap fill in.' },
];

export function LandingPage() {
  const { user } = useAuth();
  const revealFeatures = useReveal<HTMLDivElement>();
  const revealSteps = useReveal<HTMLDivElement>();
  const revealCta = useReveal<HTMLDivElement>();

  const primaryCta = user
    ? { to: '/home/dashboard', label: 'Open dashboard' }
    : { to: '/register', label: 'Get started' };

  return (
    <div className="custom-scrollbar h-svh scroll-smooth overflow-y-auto bg-background text-foreground">
      {/* Public top bar — enriched dark violet in dark mode */}
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/80 backdrop-blur-md dark:border-white/10 dark:bg-[hsl(244_38%_13%/0.72)]">
        <div className="mx-auto flex h-16 w-full max-w-[75rem] items-center justify-between gap-4 px-4 md:px-6">
          <Link to="/" aria-label="CodeStack home">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {[
              { label: 'Learn', href: '#features' },
              { label: 'How it works', href: '#how' },
              { label: 'About', href: '#about' },
              { label: 'Support', href: 'mailto:support@codestack.dev' },
            ].map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground dark:hover:bg-white/10"
              >
                {l.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <ThemeToggle />
            {user ? (
              <Button asChild>
                <Link to="/home/dashboard">Open dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" className="hidden sm:inline-flex">
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button asChild>
                  <Link to="/register">Get started</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="hero-surface relative overflow-hidden">
        <div className="relative mx-auto grid w-full max-w-[75rem] items-center gap-12 px-4 py-16 md:px-6 md:py-24 lg:grid-cols-2">
          <div>
            <span className="animate-fade-in-up inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-soft dark:border-white/10 dark:bg-white/5">
              <Sparkles className="size-3.5 text-primary" />
              A calmer place to learn to code
            </span>
            <h1
              className="animate-fade-in-up mt-5 text-4xl font-bold tracking-tight text-balance md:text-5xl lg:text-6xl"
              style={{ animationDelay: '80ms' }}
            >
              Practice, teach, and grow — all in{' '}
              <span className="text-primary">one coding platform</span>.
            </h1>
            <p
              className="animate-fade-in-up mt-5 max-w-xl text-base text-pretty text-muted-foreground md:text-lg"
              style={{ animationDelay: '160ms' }}
            >
              CodeStack brings judged practice problems, classrooms, timed tests, and a live
              gradebook together in one clean, distraction-free workspace.
            </p>
            <div
              className="animate-fade-in-up mt-8 flex flex-wrap items-center gap-3"
              style={{ animationDelay: '240ms' }}
            >
              <Button asChild size="lg">
                <Link to={primaryCta.to}>
                  {primaryCta.label}
                  <ArrowRight className="size-4" data-icon="inline-end" />
                </Link>
              </Button>
              {!user && (
                <Button asChild size="lg" variant="outline">
                  <Link to="/login">I already have an account</Link>
                </Button>
              )}
            </div>
            <div
              className="animate-fade-in-up mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground"
              style={{ animationDelay: '320ms' }}
            >
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-primary" /> Instant sandboxed judging
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Code2 className="size-4 text-primary" /> Python · JS · C++ · Java
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Trophy className="size-4 text-primary" /> Streaks &amp; points
              </span>
            </div>
          </div>

          {/* Floating product mock */}
          <div className="animate-scale-in relative" style={{ animationDelay: '200ms' }}>
            <div className="animate-float rounded-2xl border border-border bg-card p-3 shadow-soft-lg">
              <div className="flex items-center gap-1.5 px-2 py-1.5">
                <span className="size-2.5 rounded-full bg-destructive/70" />
                <span className="size-2.5 rounded-full bg-brand" />
                <span className="size-2.5 rounded-full bg-success" />
                <span className="ml-3 font-mono text-xs text-muted-foreground">two-sum.py</span>
              </div>
              {/* Faux dark editor — --sidebar is deep navy in BOTH themes, so
                  the light code text stays readable in light and dark mode. */}
              <div className="rounded-xl bg-sidebar p-4 font-mono text-[0.8rem] leading-relaxed">
                <div className="text-chart-4">
                  def <span className="text-chart-1">two_sum</span>(nums, target):
                </div>
                <div className="pl-4 text-chart-3">
                  seen = {'{}'}
                </div>
                <div className="pl-4 text-slate-300">for i, n in enumerate(nums):</div>
                <div className="pl-8 text-slate-300">
                  if target - n <span className="text-chart-4">in</span> seen:
                </div>
                <div className="pl-12 text-chart-4">
                  return <span className="text-slate-300">[seen[target - n], i]</span>
                </div>
                <div className="pl-8 text-slate-300">seen[n] = i</div>
              </div>
              <div className="mt-3 flex items-center justify-between px-1">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-success/12 px-2.5 py-1 text-xs font-semibold text-success">
                  <CheckCircle2 className="size-3.5" />
                  Accepted · 12 / 12 tests
                </span>
                <span className="font-mono text-xs text-muted-foreground">+50 pts</span>
              </div>
            </div>
            <div
              className="animate-float absolute -bottom-5 -left-5 hidden rounded-xl border border-border bg-card px-4 py-3 shadow-soft-lg sm:block"
              style={{ animationDelay: '1.5s' }}
            >
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-brand text-brand-foreground">
                  <Trophy className="size-4" />
                </span>
                <div className="leading-tight">
                  <div className="text-sm font-semibold">7-day streak</div>
                  <div className="text-xs text-muted-foreground">Keep it going 🔥</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto w-full max-w-[75rem] px-4 py-16 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">Everything in one workspace</h2>
          <p className="mt-3 text-muted-foreground">
            No tab-juggling. Practice, classrooms, tests, and grading share one calm, consistent
            interface.
          </p>
        </div>
        <div ref={revealFeatures} className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className="reveal hover-3d group rounded-2xl border border-border bg-card p-6 shadow-soft"
              style={{ '--reveal-delay': `${i * 70}ms` } as React.CSSProperties}
            >
              <span
                className="flex size-11 items-center justify-center rounded-xl shadow-soft transition-transform duration-300 group-hover:scale-105"
                style={{ backgroundColor: f.bg, color: f.fg }}
              >
                <f.icon className="size-5" />
              </span>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto w-full max-w-[75rem] px-4 py-16 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">How it works</h2>
        </div>
        <div ref={revealSteps} className="mt-12 grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div
              key={s.n}
              className="reveal hover-lift relative rounded-2xl border border-border bg-card p-6 shadow-soft"
              style={{ '--reveal-delay': `${i * 90}ms` } as React.CSSProperties}
            >
              <span className="flex size-9 items-center justify-center rounded-full bg-primary font-mono text-sm font-bold text-primary-foreground">
                {s.n}
              </span>
              <h3 className="mt-4 font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto w-full max-w-[75rem] px-4 pb-20 md:px-6">
        <div
          ref={revealCta}
          className="reveal bg-gradient-brand relative overflow-hidden rounded-3xl px-6 py-14 text-center shadow-soft-lg md:px-12"
        >
          <div
            className="pointer-events-none absolute -top-16 -right-10 size-72 rounded-full opacity-40 blur-3xl"
            style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.5), transparent 70%)' }}
          />
          <div className="relative mx-auto max-w-2xl">
            <h2 className="text-2xl font-bold tracking-tight text-white md:text-4xl">
              Ready to start building your streak?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-white/80">
              Join CodeStack and turn consistent practice into real progress.
            </p>
            <div className="mt-8 flex justify-center">
              {/* On the fixed dark gradient in BOTH themes: white pill with
                  deep-navy text. text-sidebar is deep navy in both themes;
                  text-primary would flip to light ice-blue in dark (invisible). */}
              <Button
                asChild
                size="lg"
                className="bg-white text-sidebar hover:bg-white/90"
              >
                <Link to={primaryCta.to}>
                  {primaryCta.label}
                  <ArrowRight className="size-4" data-icon="inline-end" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-[75rem] flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground md:flex-row md:px-6">
          <Logo />
          <p>© {new Date().getFullYear()} CodeStack. Learn. Practice. Grow.</p>
        </div>
      </footer>
    </div>
  );
}
