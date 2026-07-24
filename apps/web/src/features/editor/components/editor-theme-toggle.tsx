import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EditorThemePref } from '../lib/editor-theme';

const NEXT: Record<EditorThemePref, EditorThemePref> = {
  dark: 'light',
  light: 'system',
  system: 'dark',
};

const META: Record<EditorThemePref, { icon: typeof Moon; label: string }> = {
  dark: { icon: Moon, label: 'Dark' },
  light: { icon: Sun, label: 'Light' },
  system: { icon: Monitor, label: 'Match app' },
};

/**
 * Cycles the INDEPENDENT editor theme (dark → light → match-app). Separate from
 * the app-wide theme toggle by design (§13.6#1).
 */
export function EditorThemeToggle({
  pref,
  onChange,
}: {
  pref: EditorThemePref;
  onChange: (p: EditorThemePref) => void;
}) {
  const { icon: Icon, label } = META[pref];
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onChange(NEXT[pref])}
      title={`Editor theme: ${label} (click to change)`}
      aria-label={`Editor theme: ${label}. Click to change.`}
    >
      <Icon className="size-4" data-icon="inline-start" />
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}
