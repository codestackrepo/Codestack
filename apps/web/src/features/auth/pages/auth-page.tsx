import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/shared/logo';
import { AuthBrandPanel } from '../components/auth-brand-panel';
import { LoginForm } from '../components/login-form';
import { RegisterForm } from '../components/register-form';

type Mode = 'login' | 'register';

const CARD =
  'rounded-2xl border border-border bg-card p-8 shadow-[0_28px_70px_-28px_hsl(246_55%_45%/0.45)] ring-1 ring-primary/5';

/**
 * Single auth surface for login + register (§ user 2026-07-24). Both forms sit
 * fixed in their halves (login right, register left); the opaque design panel
 * slides across like a closing door and reveals the form behind it — no reload,
 * no page change. Only the design panel's center corner is rounded. Follows the
 * app light/dark theme (the design panel stays a rich violet in both). Mobile is
 * single-column.
 */
export function AuthPage({ initialMode }: { initialMode: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const isLogin = mode === 'login';

  const switchTo = (m: Mode) => {
    setMode(m);
    try {
      window.history.replaceState(null, '', m === 'login' ? '/login' : '/register');
    } catch {
      // ignore
    }
  };

  const toRegister = () => switchTo('register');
  const toLogin = () => switchTo('login');

  return (
    <div className="relative min-h-svh overflow-hidden bg-background text-foreground">
      {/* Mobile: single column, active form only */}
      <div className="flex min-h-svh items-center justify-center p-6 lg:hidden">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex justify-center">
            <Logo wordmarkClassName="text-foreground" />
          </div>
          <div key={mode} className={cn('animate-fade-in', CARD)}>
            {isLogin ? <LoginForm onSwitch={toRegister} /> : <RegisterForm onSwitch={toLogin} />}
          </div>
        </div>
      </div>

      {/* Desktop: two fixed form halves + a sliding design "door" over them */}
      <div className="relative hidden min-h-svh lg:block">
        {/* Register form — left half (revealed when the door slides right) */}
        <div
          aria-hidden={isLogin}
          className={cn(
            'absolute inset-y-0 left-0 flex w-1/2 items-center justify-center p-10',
            isLogin && 'pointer-events-none',
          )}
        >
          <div className="w-full max-w-md">
            <div className={CARD}>
              <RegisterForm onSwitch={toLogin} />
            </div>
          </div>
        </div>

        {/* Login form — right half (revealed when the door slides left) */}
        <div
          aria-hidden={!isLogin}
          className={cn(
            'absolute inset-y-0 right-0 flex w-1/2 items-center justify-center p-10',
            !isLogin && 'pointer-events-none',
          )}
        >
          <div className="w-full max-w-md">
            <div className={CARD}>
              <LoginForm onSwitch={toRegister} />
            </div>
          </div>
        </div>

        {/* Sliding design panel (the "door") — opaque, on top, covers the
            inactive form. Only its center-facing corner is rounded. */}
        <div
          className={cn(
            'absolute inset-y-0 left-0 z-20 w-1/2 overflow-hidden shadow-[0_0_80px_-20px_rgba(0,0,0,0.65)] transition-transform duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
            isLogin ? 'translate-x-0 rounded-r-[2.25rem]' : 'translate-x-full rounded-l-[2.25rem]',
          )}
        >
          <AuthBrandPanel />
        </div>
      </div>
    </div>
  );
}
