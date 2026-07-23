/**
 * Token contrast gate (UI revamp Phase 0, docs/ui-revamp-roadmap.md §13.7).
 *
 * Parses the CSS custom properties in src/index.css (both the light `:root`
 * block and the `.dark` block) and asserts WCAG 2.2 contrast on every meaningful
 * token pairing. Zero dependencies — run with `pnpm contrast:check`. Exits non-zero
 * on any failure so it can gate CI and every subsequent revamp phase.
 *
 * Thresholds:
 *   TEXT (4.5): normal-size text pairings (foreground/bg, status text, links).
 *   UI   (3.0): non-text UI boundaries (input border, focus ring) — WCAG 1.4.11.
 *
 * SCOPE: this gate validates SOLID token *values*. It intentionally does NOT
 * cover alpha-modified rendered utilities (e.g. `outline-ring/50`, the sidebar
 * heading at `text-sidebar-foreground/40`) — those are Phase 1 utility fixes
 * (§13.4). Passing here means the palette is sound, not that every rendered
 * class is; keep the two concerns separate.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = join(__dirname, '..', 'src', 'index.css');
const css = readFileSync(cssPath, 'utf8');

const TEXT = 4.5;
const UI = 3.0;

/** Extract the `--name: hsl(...)` tokens inside a given CSS block selector. */
function parseBlock(selector) {
  // Match `selector {  ... }` (first occurrence). Blocks here have no nested braces.
  const re = new RegExp(`${selector.replace('.', '\\.')}\\s*\\{([\\s\\S]*?)\\}`, 'm');
  const body = css.match(re)?.[1];
  if (!body) throw new Error(`Could not find CSS block "${selector}" in index.css`);
  const tokens = {};
  const tokenRe = /--([\w-]+):\s*hsl\(([^)]+)\)\s*;/g;
  let m;
  while ((m = tokenRe.exec(body))) {
    tokens[m[1]] = parseHsl(m[2]);
  }
  return tokens;
}

/** "205 72% 30%" or "205 72% 30% / 0.5" -> {h,s,l,a}. */
function parseHsl(str) {
  const [color, alpha] = str.split('/').map((s) => s.trim());
  const [h, s, l] = color.split(/\s+/);
  return {
    h: parseFloat(h),
    s: parseFloat(s) / 100,
    l: parseFloat(l) / 100,
    a: alpha != null ? parseFloat(alpha) : 1,
  };
}

function hslToRgb({ h, s, l }) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const mm = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + mm) * 255, (g + mm) * 255, (b + mm) * 255];
}

function relLuminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast of `fg` composited over `bg` (fg may be semi-transparent). */
function contrast(fg, bg) {
  const bgRgb = hslToRgb(bg);
  let fgRgb = hslToRgb(fg);
  if (fg.a < 1) {
    fgRgb = fgRgb.map((c, i) => c * fg.a + bgRgb[i] * (1 - fg.a));
  }
  const l1 = relLuminance(fgRgb);
  const l2 = relLuminance(bgRgb);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Pairings to verify per theme. `[fgToken, bgToken, minRatio, label]`.
 * `bg` for "text on the page" is the base surface (background/card).
 */
function pairings(t) {
  return [
    // Core text on surfaces
    ['foreground', 'background', TEXT, 'body text'],
    ['foreground', 'card', TEXT, 'card text'],
    ['muted-foreground', 'background', TEXT, 'muted text'],
    ['muted-foreground', 'card', TEXT, 'muted text on card'],
    ['muted-foreground', 'muted', TEXT, 'text on muted panel'],
    // Filled controls: *-foreground on its fill
    ['primary-foreground', 'primary', TEXT, 'primary button'],
    ['secondary-foreground', 'secondary', TEXT, 'secondary button'],
    ['accent-foreground', 'accent', TEXT, 'accent hover'],
    ['brand-foreground', 'brand', TEXT, 'text on amber highlight'],
    ['destructive-foreground', 'destructive', TEXT, 'destructive button'],
    ['success-foreground', 'success', TEXT, 'success badge'],
    ['warning-foreground', 'warning', TEXT, 'warning badge'],
    ['info-foreground', 'info', TEXT, 'info badge'],
    // Status/link colors used AS TEXT on the page
    ['primary', 'background', TEXT, 'link (primary on bg)'],
    ['destructive', 'background', TEXT, 'error text'],
    ['destructive', 'card', TEXT, 'error text on card'],
    ['success', 'background', TEXT, 'success text'],
    ['warning', 'background', TEXT, 'warning text'],
    ['info', 'background', TEXT, 'info text'],
    // Non-text UI (1.4.11)
    ['input-border', 'background', UI, 'input boundary'],
    ['ring', 'background', UI, 'focus ring'],
    // Sidebar (deep-navy rail in both themes)
    ['sidebar-foreground', 'sidebar', TEXT, 'sidebar text'],
    ['sidebar-accent-foreground', 'sidebar-accent', TEXT, 'sidebar active item'],
    ['sidebar-primary-foreground', 'sidebar-primary', TEXT, 'sidebar brand chip'],
  ].map(([fg, bg, min, label]) => ({ fg, bg, min, label }));
}

let failures = 0;
let checks = 0;
for (const [theme, selector] of [
  ['light', ':root'],
  ['dark', '.dark'],
]) {
  const t = parseBlock(selector);
  for (const { fg, bg, min, label } of pairings(t)) {
    if (!t[fg] || !t[bg]) {
      console.error(`✗ [${theme}] MISSING TOKEN: --${fg} or --${bg} (${label})`);
      failures++;
      continue;
    }
    checks++;
    const ratio = contrast(t[fg], t[bg]);
    const ok = ratio >= min;
    if (!ok) {
      failures++;
      console.error(
        `✗ [${theme}] ${label}: --${fg} on --${bg} = ${ratio.toFixed(2)}:1 (need ${min}:1)`,
      );
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} contrast failure(s). Fix tokens in src/index.css.`);
  process.exit(1);
}
console.log(`✓ All ${checks} token contrast pairings pass (light + dark).`);
