import { useCallback, useState } from 'react';
import { useTheme } from 'next-themes';
import type { Monaco } from '@monaco-editor/react';

/**
 * Editor theme is INDEPENDENT of the app theme (§13.6#1 / user decision
 * 2026-07-24): most coders want a dark editor even in a light app (VS Code /
 * Replit style). The preference persists separately from next-themes.
 *   'dark'  (default) · 'light' · 'system' (follow the app theme)
 * Monaco can't read CSS custom properties, so the themes below hardcode hexes
 * approximating our matte indigo/navy token palette.
 */
export type EditorThemePref = 'dark' | 'light' | 'system';

const STORAGE_KEY = 'codestack-editor-theme';

export const EDITOR_DARK = 'codestack-dark';
export const EDITOR_LIGHT = 'codestack-light';

let defined = false;

/** Register the CodeStack Monaco themes once (idempotent across editor mounts). */
export function defineEditorThemes(monaco: Monaco) {
  if (defined) return;
  monaco.editor.defineTheme(EDITOR_DARK, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '86849c', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'b3aaff' },
      { token: 'string', foreground: '7ee0c0' },
      { token: 'number', foreground: 'f5b74e' },
      { token: 'type', foreground: 'a9bcff' },
      { token: 'function', foreground: 'a9bcff' },
      { token: 'variable', foreground: 'e6e4f2' },
      { token: 'constant', foreground: 'f5b74e' },
    ],
    colors: {
      'editor.background': '#14131e',
      'editor.foreground': '#e6e4f2',
      'editorLineNumber.foreground': '#565571',
      'editorLineNumber.activeForeground': '#b3aaff',
      'editor.selectionBackground': '#343069',
      'editor.lineHighlightBackground': '#1e1d30',
      'editorCursor.foreground': '#b3aaff',
      'editorIndentGuide.background1': '#282740',
      'editorWidget.background': '#1e1d30',
    },
  });
  monaco.editor.defineTheme(EDITOR_LIGHT, {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
      { token: 'keyword', foreground: '443aa8' },
      { token: 'string', foreground: '0f766e' },
      { token: 'number', foreground: 'b45309' },
      { token: 'type', foreground: '2563eb' },
      { token: 'function', foreground: '2563eb' },
    ],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#1c1a29',
      'editorLineNumber.foreground': '#9ca3af',
      'editorLineNumber.activeForeground': '#443aa8',
      'editor.lineHighlightBackground': '#f1f0fb',
      'editorCursor.foreground': '#443aa8',
    },
  });
  defined = true;
}

/** Independent editor-theme preference + the resolved Monaco theme name. */
export function useEditorTheme() {
  const { resolvedTheme } = useTheme();
  const [pref, setPrefState] = useState<EditorThemePref>(() => {
    if (typeof window === 'undefined') return 'dark';
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'system' || stored === 'dark' ? stored : 'dark';
  });

  const setPref = useCallback((p: EditorThemePref) => {
    setPrefState(p);
    try {
      window.localStorage.setItem(STORAGE_KEY, p);
    } catch {
      // ignore storage failures (private mode, quota)
    }
  }, []);

  const effectiveDark = pref === 'system' ? resolvedTheme !== 'light' : pref === 'dark';
  const monacoTheme = effectiveDark ? EDITOR_DARK : EDITOR_LIGHT;

  return { pref, setPref, monacoTheme };
}
