import type { CSSProperties } from 'react';

/**
 * Fresh, aesthetic accent colours for icon chips on CONTENT pages (dashboards,
 * feature pages) — deliberately NOT used in the app shell / sidebar, which stays
 * on the calm indigo-navy brand. Vivid but harmonious; each reads on both the
 * light and dark card tints produced by `accentChip`.
 */
export const ACCENTS = [
  '#6366f1', // indigo
  '#0ea5e9', // sky
  '#14b8a6', // teal
  '#10b981', // emerald
  '#f59e0b', // amber
  '#f43f5e', // rose
  '#8b5cf6', // violet
  '#ec4899', // pink
] as const;

/** Deterministic accent for a given index (wraps around the palette). */
export function accentAt(i: number): string {
  return ACCENTS[((i % ACCENTS.length) + ACCENTS.length) % ACCENTS.length];
}

/** Soft tint fill + saturated glyph — the colourful icon-chip look (§14.4). */
export function accentChip(accent: string): CSSProperties {
  return {
    backgroundColor: `color-mix(in oklab, ${accent} 15%, var(--card))`,
    color: accent,
  };
}
