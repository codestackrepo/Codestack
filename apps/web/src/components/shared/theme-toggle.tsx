import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';

/**
 * Light/dark toggle. `next-themes` resolves the theme only after mount (no SSR
 * here, but `resolvedTheme` is briefly undefined), so we render a stable
 * placeholder until mounted to avoid an icon flash / hydration mismatch.
 */
export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  // Canonical next-themes hydration guard: a one-shot post-mount flag, not
  // derivable during render.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === 'dark';

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle color theme"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {mounted && isDark ? <Sun className="size-5" /> : <Moon className="size-5" />}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
