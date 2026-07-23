import type { ReactNode } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Logo } from '@/components/shared/logo';

const FEATURES = [
  'Solve problems with instant, sandboxed judging',
  'Assignments, classrooms, and a live gradebook',
  'Practice mode and progress tracking',
];

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
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-15" />
        <div className="relative">
          <Logo />
        </div>
        <div className="relative space-y-6">
          <h2 className="font-heading max-w-md text-3xl leading-tight font-bold">
            Learn to code by solving real problems.
          </h2>
          <ul className="space-y-3">
            {FEATURES.map((f) => (
              <li
                key={f}
                className="flex items-start gap-2.5 text-sm text-sidebar-foreground/80"
              >
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-sidebar-primary" />
                {f}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-sidebar-foreground/60">© CodeStack</p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex justify-center lg:hidden">
            <Logo />
          </div>
          <div className="space-y-1.5">
            <h1 className="font-heading text-2xl font-bold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
