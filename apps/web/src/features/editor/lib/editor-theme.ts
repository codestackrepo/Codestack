import { useCallback, useState } from 'react';
import { useTheme } from 'next-themes';
import type { Monaco } from '@monaco-editor/react';

/**
 * Editor theme is INDEPENDENT of the app theme (§13.6#1 / user decision
 * 2026-07-24): most coders want a dark editor even in a light app (VS Code /
 * Replit style). The preference persists separately from next-themes.
 *   'dark'  (default) · 'light' · 'system' (follow the app theme)
 * Monaco can't read CSS custom properties, so the themes below hardcode hexes
 * approximating our violet-forward token palette.
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
      { token: 'comment', foreground: '8b86a6', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'c8a6ff' },
      { token: 'string', foreground: '7ee0c0' },
      { token: 'number', foreground: 'f5b74e' },
      { token: 'type', foreground: 'a9bcff' },
      { token: 'function', foreground: 'a9bcff' },
      { token: 'variable', foreground: 'e6e2f0' },
      { token: 'constant', foreground: 'f5b74e' },
    ],
    colors: {
      'editor.background': '#171129',
      'editor.foreground': '#e6e2f0',
      'editorLineNumber.foreground': '#5b5573',
      'editorLineNumber.activeForeground': '#c8a6ff',
      'editor.selectionBackground': '#3a2f6b',
      'editor.lineHighlightBackground': '#1f1838',
      'editorCursor.foreground': '#c8a6ff',
      'editorIndentGuide.background1': '#2a2342',
      'editorWidget.background': '#1f1838',
    },
  });
  monaco.editor.defineTheme(EDITOR_LIGHT, {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
      { token: 'keyword', foreground: '6d28d9' },
      { token: 'string', foreground: '0f766e' },
      { token: 'number', foreground: 'b45309' },
      { token: 'type', foreground: '2563eb' },
      { token: 'function', foreground: '2563eb' },
    ],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#1e1b2e',
      'editorLineNumber.foreground': '#9ca3af',
      'editorLineNumber.activeForeground': '#6d28d9',
      'editor.lineHighlightBackground': '#f4f1fb',
      'editorCursor.foreground': '#6d28d9',
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
