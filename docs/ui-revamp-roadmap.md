# CodeStack — UI/UX Revamp Roadmap & Design System

> **Status:** Proposal for review (Fable + product) · **Last updated:** 2026-07-24 · **Owner:** Frontend
>
> A full end-to-end UI/UX revamp toward an **eGov-portal aesthetic** — simple, neat, clean, high
> contrast, spacious, fully responsive, enterprise-grade. **Light is the default theme**; dark is a
> first-class peer. This doc defines the *what* (design system: color, type, spacing, components,
> flows) and the *how* (phased implementation). Nothing here is implemented yet — this is the plan to
> review and sign off before code.

---

## 1. Goals & principles

> **Design intent (refined by the user):** the e-idstack eGov portal is a **reference, not a template
> to copy**. The target is a **better, student- and coder-friendly, simple, pleasant, and soothing**
> product — take the portal's cleanliness, trust, and structure, but make it *calmer and warmer* than
> a literal institutional site. Soothing = soft off-white/low-glare surfaces, gentle (not stark)
> contrast within AA, generous breathing room, quiet motion; coder-friendly = a comfortable
> (optionally dark) code editor, monospace where it helps, low visual noise. This reinforces the
> "institutional shell + warm reward layer" split ([§13.5](#135-engagement-surfaces-institutional-shell-warm-reward-layer)).

Visual language from **best-in-class coding & learning platforms** (Codecademy/LeetCode calm surfaces,
Linear/GitHub table + typographic polish, VS Code/Replit editor ergonomics); the eGov portal is a
*structure/spacing* reference only and the result must **not** read as a government site. Public-sector
design systems (GOV.UK forms, USWDS tables) are borrowed as *accessibility engineering* standards only,
styled in our own calm dev skin — see [§13.1](#131-reference-lock-answers-q5--not-a-government-look-user-steer-2026-07-24):

1. **Clarity over decoration.** Flat surfaces, one clear action per view, no gradients-as-noise. Every
   element earns its place.
2. **Contrast where it matters.** Strong text/background contrast (WCAG 2.2 **AA minimum**, AAA for
   body text where feasible); a single confident accent for primary actions, used sparingly so it
   stays meaningful.
3. **Spacious & aligned.** Generous, consistent spacing on an 8px rhythm; everything snaps to a grid;
   comfortable line-length and density.
4. **Trustworthy & calm.** Professional, institutional tone. Restrained palette, predictable
   patterns, no surprising motion.
5. **Accessible by construction.** Visible focus rings, ≥44px touch targets, semantic HTML, labels on
   every control, reduced-motion respected.
6. **Responsive, mobile-up.** Every screen works from 360px to ultrawide; content reflows, never
   truncates or side-scrolls the page body.
7. **One system, two themes.** Light (default) and dark share tokens and structure; dark is not an
   afterthought.

**Non-goals:** no framework change (stay React 19 + Tailwind 4 + shadcn/radix); no new heavy deps; no
rewrite of feature logic — this is presentation-layer only. The backend and data flows are untouched.

---

## 2. Current state & gaps

**What's already good (keep):** Tailwind 4 `@theme` token architecture, shadcn/radix primitives, a
coherent navy+amber brand, an existing light/dark split, Inter, sensible radius scale.

**Gaps the revamp closes:**

| Area | Today | Revamp |
|---|---|---|
| Default theme | `system` (main.tsx) | **`light`** default; user can still pick dark/system |
| Contrast | Muted-foreground ~42% L on tinted greys — borderline for small text | Tighten to WCAG AA everywhere; darker body text |
| Spacing/density | Ad-hoc paddings per page | One spacing scale + page/section/card rhythm tokens |
| Layout | AppShell + sidebar, varying page widths | Standardized content container, page header, and grid |
| Accent discipline | Amber CTA + navy primary sometimes both compete | Clear hierarchy: primary = navy action, amber = single hero highlight |
| Elevation | Mixed `ring-1`/`border`/`shadow` | One elevation ladder (borders-first, minimal shadow) |
| Data density | Tables/cards inconsistent | Consistent table, list, and stat-tile specs |
| Focus/az11y | Present but uneven | Uniform focus ring + reduced-motion + skip-link |

---

> **⚠️ Corrections applied — see [§13](#13-fable-review-outcomes-corrections--reference-lock).** A Fable
> design review computed the contrast for every pairing below; several §3 values failed WCAG AA and are
> **superseded by the corrected values in §13**. Where §3 and §13 disagree, §13 wins.

## 3. Color system

eGov palettes are **neutral-dominant with one strong institutional accent**. We keep the CodeStack
navy as the institutional color and **retire amber from routine CTAs** (it stays only for a single
"highlight"/celebration accent), because two competing accents work against eGov calm + contrast.

All values are HSL (matching the current `index.css` convention). Contrast ratios are against the
paired surface; targets: **body text ≥ 7:1 (AAA), large/secondary text ≥ 4.5:1 (AA)**.

### 3.1 Light theme (default)

| Token | HSL | Role / notes |
|---|---|---|
| `--background` | `210 20% 99%` | App background — a hair off pure white, cooler and calmer |
| `--surface` *(new)* | `0 0% 100%` | Cards/sheets sit slightly brighter than bg (subtle layering without shadow) |
| `--foreground` | `212 40% 12%` | Body text — near-black navy, ~15:1 on bg (AAA) |
| `--muted` | `210 24% 95%` | Muted fills (table stripes, chips) |
| `--muted-foreground` | `212 16% 38%` | Secondary text — darkened from today's 42% to clear AA (~5.6:1) |
| `--border` | `214 20% 88%` | Hairline borders (primary separation device — eGov leans on borders, not shadow) |
| `--primary` | `205 72% 30%` | Institutional navy, slightly deeper for AA on white as a text/link color |
| `--primary-foreground` | `0 0% 100%` | |
| `--ring` | `205 72% 42%` | Focus ring — solid, 2px, high-visibility |
| `--accent` *(highlight)* | `37 91% 52%` | Amber — **highlight only** (badges, celebratory, active-nav marker), never the default button |
| `--success` *(new)* | `152 58% 34%` | Verdict/accepted, positive stats |
| `--warning` *(new)* | `35 92% 40%` | Deadlines, caution banners |
| `--destructive` | `0 70% 45%` | Errors/delete |
| `--info` *(new)* | `205 70% 40%` | Neutral informational |

Semantic status colors (`success`/`warning`/`info`) become **first-class tokens** so verdict badges,
deadline banners, and KPIs stop hand-rolling Tailwind color literals (as they do today).

### 3.2 Dark theme (peer)

Navy-tinted dark (matches the current dark-logo direction), but raised contrast:

| Token | HSL | Notes |
|---|---|---|
| `--background` | `212 42% 9%` | |
| `--surface` | `212 38% 12%` | Cards one step up |
| `--foreground` | `210 30% 94%` | ~13:1 |
| `--muted-foreground` | `210 18% 66%` | AA on dark surfaces |
| `--border` | `212 26% 22%` | |
| `--primary` | `202 70% 72%` | Pale ice-navy so it reads as an action on dark (dark navy would vanish) |
| `--primary-foreground` | `212 55% 12%` | |
| `--accent` | `37 92% 58%` | Highlight only, as in light |
| status tokens | lighten each ~+12% L | maintain AA on dark surfaces |

### 3.3 Sidebar

Keep the **deep-navy rail in both themes** (it's a strong, recognizable eGov "masthead" device), but
increase item contrast and use the amber marker only for the active item. Sidebar tokens stay as a
separate group so the rail is theme-independent.

### 3.4 Charts

Reuse the semantic + a sequential navy→teal ramp for the gradebook/gamification charts; align chart
colors to the new `success/info/accent` tokens so data viz reads consistently with the UI (this also
feeds the existing recharts components). *(Follow the `dataviz` skill when we build/adjust charts.)*

---

## 4. Typography

- **Family:** keep Inter Variable (excellent for dense UI). Add a monospace token
  (`--font-mono`, e.g. system `ui-monospace`) for code/IDs/inputs.
- **Type scale** (rem, 1.25 ratio-ish, tuned for density):

| Token | Size / line-height | Use |
|---|---|---|
| `display` | 2.25 / 1.15, weight 700 | Page heroes (rare) |
| `h1` | 1.75 / 1.2, 700 | Page titles |
| `h2` | 1.375 / 1.25, 600 | Section headers |
| `h3` | 1.125 / 1.3, 600 | Card titles |
| `body` | 0.9375 (15px) / 1.55, 400 | Default text |
| `small` | 0.8125 / 1.5 | Secondary/meta |
| `mono` | 0.875 / 1.5 | Code, IDs, verdicts |

- Max text measure ~72ch for prose (problem statements, docs).

---

## 5. Spacing, radius, elevation, motion

- **Spacing:** 8px base scale `[2,4,8,12,16,24,32,48,64]`. Rhythm tokens: page gutter `24/32`,
  section gap `24`, card padding `20/24`, control height `40` (touch-friendly, up from today's 32).
- **Radius:** slightly tighter/flatter for the institutional feel — base `0.5rem` (down from
  `0.625`); keep the sm→3xl scale relationship.
- **Elevation ladder (borders-first):**
  - `flat` — border only (default cards, inputs).
  - `raised` — border + `shadow-sm` (popovers, dropdowns).
  - `overlay` — border + `shadow-md` + scrim (dialogs, sheets).
  Minimal, consistent; no decorative shadows on static content.
- **Motion:** 120–200ms ease-out for hover/enter; respect `prefers-reduced-motion` (disable non-
  essential transitions). No parallax, no long spinners — use skeletons.

---

## 6. Component specifications (shadcn refits)

Each primitive gets a spec so the whole app reads as one system. Highlights:

- **Button:** primary = navy solid; secondary = bordered neutral; ghost = text; **amber reserved** for
  a single hero/celebration; destructive = red-tinted. Height 40 (default), 32 (sm). Visible focus
  ring. Loading = inline spinner + preserved width.
- **Input / Select / Textarea:** 40px, clear border, `ring` on focus, error state = destructive border
  + helper text. Labels always visible (no placeholder-as-label).
- **Card:** `surface` bg, hairline border, `radius-lg`, 20–24 padding, optional header row.
- **Table:** sticky header, zebra via `muted`, row hover, right-aligned numerics (tabular-nums),
  overflow-x scroll *inside* the table container only. Used by admin users, gradebook, etc.
- **Badge / Status pill:** driven by semantic tokens (success/warning/info/destructive/neutral) —
  replaces today's inline color literals in verdict/assignment-status badges.
- **Stat tile (KPI):** label (uppercase, muted), value (h1/tabular), optional delta/hint + icon in a
  tinted square. Standardize the admin/dashboard/gamification tiles.
- **Nav (sidebar + topbar):** grouped sections, role-filtered (already built), amber active marker,
  collapsible on mobile via the existing sheet.
- **Empty / Loading / Error states:** one `EmptyState`, skeletons that match final layout, consistent
  error card with retry.
- **Dialog / Sheet / Toast / Tooltip:** overlay elevation, focus trap, escape/click-out, toasts
  top-right with semantic colors.
- **Editor chrome (Monaco pages):** full-bleed shell keeps its own top bar; align its buttons, tabs,
  and result panel to the new tokens (Run neutral, Submit primary).

---

## 7. Layout & responsiveness

- **App shell:** fixed deep-navy sidebar (desktop) / drawer (mobile) + a slim topbar (page title,
  breadcrumbs, theme toggle, notifications, profile). Content in a **max-w container** (`~1200px`
  standard pages; full-bleed for editor) with consistent gutters.
- **Standard page frame:** `PageHeader` (title + description + actions) → content grid. Every feature
  page adopts it (many already use `PageHeader`).
- **Breakpoints:** `sm 640 / md 768 / lg 1024 / xl 1280`. Grids collapse 3→2→1; sidebar becomes a
  drawer < `lg`; tables gain horizontal scroll or card-list fallback on small screens.
- **Alignment:** everything on the 8px grid; consistent vertical rhythm between sections.

---

## 8. Page-by-page revamp inventory

Applied in dependency order (shell/tokens first, then pages). Each page = adopt tokens + `PageHeader` +
standardized components + responsive pass + light/dark + a11y check.

1. **Auth** (login, register, request-access) — centered card, brand masthead, clear validation.
2. **App shell + nav** (sidebar, topbar, mobile drawer) — the frame everything renders in.
3. **Dashboards** (admin/professor/student) — KPI tiles + panels; student gamification panel.
4. **Problems** (list + facets + detail) — filter rail, problem cards, solve CTA.
5. **Editor** (`/solve`, `/practice`) — Monaco shell, run/submit, verdict/result panel.
6. **Assignments** (list, form, builder, take) — including the timed take page + builder from #22/#23.
7. **Classrooms** (list, detail, form, batch management).
8. **Grading** (gradebook, item-review drawer, charts).
9. **Admin** (overview KPIs, user management, onboarding queues, module-access matrix).
10. **Gamification** (heatmap, stat cards, difficulty chart) — align to tokens + `dataviz`.
11. **Profile / Settings / Topics(coming-soon)**.
12. **Cross-cutting**: toasts, empty/loading/error, 403/404, skeletons.

---

## 9. Implementation roadmap (phased)

Each phase ends green on `typecheck + lint + build` and a light/dark + responsive spot-check. Ordered
so foundations land before consumers (a token change then propagates for free).

- **Phase 0 — Foundations (tokens & config).** Rework `index.css` tokens (light default + dark +
  new semantic/surface tokens + spacing/radius), set `defaultTheme="light"`, add `--font-mono`,
  focus-ring + reduced-motion + skip-link base styles. *No component churn yet; the app should still
  render, just recolored.*
- **Phase 1 — Primitives.** Refit shadcn components (button, input, select, textarea, card, table,
  badge, dialog, sheet, tabs, tooltip, skeleton) + shared `PageHeader`/`StatCard`/`EmptyState` to the
  new specs. This is where most visual lift happens, app-wide, at low risk.
- **Phase 2 — Shell & navigation.** Topbar, sidebar polish, mobile drawer, content container, page
  frame standardization.
- **Phase 3 — Pages sweep.** Apply the §8 inventory page-by-page (feature by feature), each with a
  responsive + a11y pass. Largest phase; parallelizable per feature.
- **Phase 4 — Data viz & editor.** Charts to tokens (`dataviz`), Monaco chrome alignment, verdict/
  result panels.
- **Phase 5 — Polish & QA.** Contrast audit (automated + manual), keyboard/focus pass, reduced-motion,
  empty/loading/error states, cross-browser, light/dark parity screenshot review, and a VPAT-style
  a11y checklist.

Rough sequencing note: Phases 0–2 are the high-leverage core (do first, carefully); Phase 3 scales out.

---

## 10. Accessibility & theming rules (contract)

- Light is the **default**; theme toggle offers Light/Dark/System; choice persists (next-themes).
- Every interactive element: visible focus ring, name/label, ≥44px target on touch.
- Color never the sole signal (icons/text accompany status colors).
- All token pairs meet WCAG AA (AAA for body); verified in Phase 5.
- `prefers-reduced-motion` disables non-essential animation.
- Semantic HTML + landmarks; a skip-to-content link in the shell.

---

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Token change causes wide, hard-to-review visual diffs | Phase 0 isolated + screenshot the top ~10 screens before/after; land tokens as one reviewable commit |
| Retiring amber CTAs changes familiar affordances | Keep amber as the active-nav + celebratory highlight so brand identity persists; validate with a screen or two before the sweep |
| Contrast tightening shifts many greys | Drive from tokens only; run an automated contrast check in Phase 5 |
| Scope creep into feature logic | Presentation-only rule; no data/flow changes; feature behavior locked by the just-shipped #21–40 work |
| Dark-mode regressions | Every phase spot-checked in both themes; parity is a gate |

---

## 12. Open questions (for the review/discussion)

1. **Amber:** demote to highlight-only (recommended, more eGov), or keep amber as the primary CTA
   color? This is the biggest identity decision.
2. **Density:** comfortable (40px controls, roomy) vs. compact — recommendation is comfortable for the
   eGov feel; confirm.
3. **Container width:** 1200px standard vs. wider for data-heavy admin/gradebook pages.
4. **Scope of "end-to-end":** all pages in one push, or ship Phase 0–2 (foundations + primitives +
   shell) first for a fast, high-impact visible change, then sweep pages? (Recommendation: the latter.)
5. **Reference lock:** any specific eGov portal to mirror closely (GOV.UK vs USWDS vs a local
   government portal), so type/spacing/nav match a concrete target?

---

## 13. Fable review outcomes, corrections & reference lock

A Fable-model design + a11y review (2026-07-24) approved the direction and phasing but computed the
contrast on every color pairing and found several failures plus one token collision. This section is
authoritative over §3–§9 where they conflict.

### 13.1 Reference lock (answers Q5) — **NOT a government look** (user steer 2026-07-24)
The product must **not read as a gov/civic portal.** The eGov portal is a *structural* reference only,
never a stylistic target.
- **Structure reference (eGov only):** the user's portal **https://e-gov-portal.e-idstack.com/** —
  borrow **only** its clean, spacious, card-based layout, generous whitespace, calm surfaces, and clear
  hierarchy. Do **not** copy its palette, chrome, or institutional tone. Lock a **5-screenshot sheet**
  for *layout rhythm* reference, not visual mimicry.
- **Visual language (the actual look):** draw from **best-in-class coding & learning platforms** — the
  calm, low-chroma reading surfaces and progress framing of Codecademy/LeetCode; the crisp tables,
  quiet enterprise polish, and typographic restraint of Linear/GitHub; the editor ergonomics of
  VS Code/Replit. Target: **coder-friendly, soothing, pleasant, focused** — student-first, not
  form-first. This is what makes it "more better" than the reference.
- **Accessibility/forms rigor (borrow the engineering, not the aesthetic):** keep **GOV.UK's
  error-summary/validation pattern** and **USWDS's table/density discipline** as *implementation*
  standards — they buy AA compliance and predictable forms — but styled in our own calm dev-platform
  skin, not their branding. **Keep Inter.**

### 13.2 Corrected color tokens (MUST use these — several §3 values failed AA)
Light:
- `--warning`: **`32 95% 34%`** (was `35 92% 40%` = 3.55:1, failed). Or keep a lighter fill + add
  `--warning-foreground` dark text (`fg` on `35 92% 48%` = 6.71:1). Pick one and encode it.
- `--success`: **`152 60% 30%`** (was `152 58% 34%` = 4.37:1, failed) → 5.28:1.
- `--input-border` *(new)*: **`214 12% 55%`** (3.49:1) for text-input boundaries; the hairline
  `--border 214 20% 88%` (1.3:1) stays for cards/dividers only (fails 1.4.11 as an input boundary).
- **Amber never carries text on light** (2.05:1); amber fills use `--foreground` text (7.86:1).
- `--surface`: **alias onto shadcn `--card`/`--popover`** (`--card: var(--surface)`), do NOT introduce
  a token no primitive consumes. (surface-vs-bg layering is imperceptible at 99% — rely on borders.)
- Endorsed as-is (computed): `foreground` 16.5:1, `muted-foreground` 6.3:1, `primary 205 72% 30%`
  7.82:1 (both as link-on-white and white-on-navy — navy-as-primary confirmed), `ring` 4.63:1,
  `info` 5.16:1, `destructive` 5.87:1.

Dark — **replace the blanket "+12% L" rule with explicit per-hue values** (red breaks the formula):
- `--destructive` (dark): **`0 75% 64%`** (formula gave 4.04:1, failed) → 4.99:1. Tune success/warning
  similarly per-hue to ≥4.5:1 on the dark surface. Core dark tokens (fg 15.8:1, primary 9.66:1) pass.

### 13.3 Token collision (BLOCKING)
- **Do NOT map `--accent` to amber.** shadcn uses `--accent` as the neutral hover/selected fill
  (dropdown-menu, select consume it); amber there = every menu hover flashes amber. Keep the highlight
  on **`--brand`** (the existing token — preserve its name); leave `--accent` neutral. `--brand` is
  referenced in **31 places across 19 files**, so it must survive as a token until Phase 3 migrates
  consumers — Phase 0 "recolor only" holds only if `--brand` is kept.

### 13.4 Component contrast/spec fixes
- **Hover = darken, not lighten.** Replace `hover:bg-primary/80` (white text = 4.78:1, borderline)
  with a darken-on-hover; eGov convention.
- **Focus ring = solid `ring-2`,** not shadcn's `ring-ring/50` (50% alpha) — the ring utilities must
  change in **Phase 1** (Phase 0 tokens alone won't deliver it).
- **Sidebar section headings ≥ `/60` alpha** (current `/40` = 3.01:1, fails).

### 13.5 Engagement surfaces (institutional shell, warm reward layer)
Full eGov restraint applies everywhere **except** these named surfaces, where amber/success get
expressive freedom (filled tiles, celebratory micro-animation gated on `prefers-reduced-motion`):
**gamification panel, contribution heatmap, streak indicators, and the Accepted-verdict moment.** The
page sweep (§8) must NOT homogenize these.

### 13.6 Missing specs to add (ordered by retrofit cost)
1. **Monaco/editor theming** (biggest hole): Monaco can't read CSS vars — needs `defineTheme` synced to
   next-themes + a per-theme syntax palette + an editor-surface token. **Product call:** allow an
   *independent editor-theme preference* (app-light + editor-dark, VS Code-style) — most students
   expect a dark editor.
2. **GOV.UK error-summary form pattern** (top-of-form summary box, `aria-live`, links focusing the
   offending field) — not just per-field errors.
3. **Compact table density** (`density="compact"`) ships in **Phase 1**, not Phase 5 — collides with
   "comfortable 36px" on gradebook/admin.
4. **Error taxonomy**: add 401-expiry, 5xx, offline, and **websocket-drop** (editor submission socket
   "disconnected/reconnecting") to the 403/404 already listed.
5. **QueryBoundary pattern** (one `isPending/isError/empty` convention per page) — else Phase 3 breeds
   12 bespoke loading states.
6. Iconography standard (16px/2-stroke inline, 20px nav); **align sonner `richColors` → semantic
   tokens** (currently bypasses them); heatmap **5-step sequential ramp** as tokens; logical properties
   (`ps-*/ms-*`) during the sweep for cheap RTL-readiness.

### 13.7 Sequencing amendments
- **Move the automated contrast check to Phase 0** as a token-pair unit test that gates every phase
  (~40 lines; cheapest risk-kill).
- **Split Phase 1 → 1a (paint: color/radius/border, low risk) and 1b (geometry: the 32→40px control
  jump reflows every toolbar/table/dialog/editor bar — reviewable separately, screenshot-gated).**
- **Editor is highest-regression-risk and was scheduled twice** (§8#5 + Phase 4) *while it has active
  work* — merge into ONE dedicated phase sequenced **after** in-flight editor work lands.
- Note the **`--brand` 31-usage migration** explicitly in Phase 3.

### 13.8 Decisions (✅ ALL CONFIRMED by user 2026-07-24 — implementation unblocked)
1. **Amber → highlight-only: YES** ✅ (2.05:1 on white makes amber CTAs a permanent a11y liability).
   Keep token named `--brand`; define engagement surfaces (§13.5).
2. **Density: comfortable, but 36px default control height** ✅ (not 40; 40 via `size="lg"` for auth),
   ship compact table density alongside. Touch-target ≥24px (WCAG 2.5.8 AA) met via control+spacing.
3. **Container width: not one number** ✅ — `PageFrame` prop: `default` 1200 / `wide` ~1440 (gradebook,
   admin users, module matrix) / `full` (editor); annotate each §8 row.
4. **Scope: ship Phases 0–2 first** ✅ (foundations+primitives+shell), then Phase 3 one-feature-per-PR
   with before/after screenshots — never a mega-branch.
5. **Reference — REVISED by user 2026-07-24: NOT a gov look.** eGov portal = *structure/spacing*
   reference only; visual language from best-in-class coding/learning platforms (Codecademy/LeetCode
   calm surfaces, Linear/GitHub table + typographic polish, VS Code/Replit editor). Borrow GOV.UK forms
   + USWDS table rigor as *engineering* standards only, styled in our own calm dev skin. Inter kept
   (§13.1). ✅ direction set by user.
- **`defaultTheme` flip to `light`: ACCEPTED** ✅ (system-dark users move to light; next-themes only
  persists explicit choices — acceptable, light is the new default brand experience).
- **Editor theme: INDEPENDENT, default dark** ✅ (user 2026-07-24) — app-light + editor-dark by default,
  VS Code/Replit style, with a per-user editor-theme toggle persisted separately from app theme. Monaco
  `defineTheme` synced to an *independent* editor-theme pref, NOT next-themes (§13.6#1).

## 14. Added scope (user 2026-07-24): public Home page + UI animation layer

Two additions on top of the phased plan. Both honor the "not-gov, coder-friendly, soothing" direction.

### 14.1 Public Home / landing page
Today `/` redirects into the auth-gated `/home` (dashboard) — there is **no public page**. Add a
public **landing page at `/`** (unauthenticated-accessible): hero with animated headline + primary CTA
(Get started → register / Sign in), a short "what CodeStack is" value strip, feature cards (practice,
classrooms, assignments, playground), a lightweight "how it works" flow, and a footer. Logged-in
visitors see an "Open dashboard" CTA instead of sign-in. Full-bleed (no AppShell sidebar); its own
slim public top bar with the theme toggle. Style = calm dev-platform hero (LeetCode/Codecademy energy),
NOT a gov hero. Reuses the token system + motion layer below.

### 14.2 Animation / motion layer
A single motion foundation (Phase 2) reused everywhere:
- **Reduced-motion first:** a global `prefers-reduced-motion: reduce` guard neutralizes animation +
  smooth scroll. Every animation must degrade to instant.
- **Foundation utilities** (index.css keyframes + classes): `fade-in`, `fade-in-up`, `scale-in`,
  `float` (gentle idle), plus staggered reveal-on-scroll via an `useReveal` IntersectionObserver hook.
- **Micro-interactions** (already partly in): control hover/press transitions, focus ring transition.
- **Route/content transitions:** subtle fade/slide-in on page mount (Suspense-boundary friendly).
- **Engagement celebration** (§13.5): the Accepted verdict + streak/points get a tasteful pop/confetti
  moment — expressive, still reduced-motion-gated.
- Restraint: motion is calm and quick (150–400ms), never blocks input, honors the "soothing" intent.

### 14.3 PageFrame width primitive (Phase 2, decision 3)
`<PageFrame width="default|wide|full">` centralizes the container width (default ~1200 / wide ~1440 /
full). Ships as a primitive now; pages adopt it during the Phase 3 sweep. AppShell keeps its current
`max-w-7xl` default until pages migrate (avoids a flag-day refactor).

### 14.4 Reference board (user-supplied 2026-07-24: Mr.Booster + Chaart dashboards)
Two friendly SaaS dashboards. We adopt their **form**, not their palette (our navy+amber brand and
AA-locked tokens stay; these lean purple+warm).
- **Soft floating cards:** larger radius (cards use `rounded-2xl`), gentle shadows (new `--shadow-soft`
  elevation), generous padding + whitespace.
- **Colorful accent tiles:** category/feature cards each take a distinct color from the **chart
  palette** (`--chart-1..5` = blue/amber/teal/violet/green) as a soft tint + icon chip — never
  monochrome rows. (Engagement/feature surfaces, §13.5 — restraint doesn't apply here.)
- **Bold friendly greeting** headings on dashboard/home ("Hello, {name}"), larger than today.
- **Stat card** pattern: icon chip + big number + label; positive/negative deltas use success/destructive.
- **Gradient promo/CTA card:** brand gradient (navy→amber, or a chart-hue pair) with optional imagery —
  used for the home hero and a dashboard engagement/upsell card.
- **Warmth:** a soft off-white app background (very light warm grey), not stark white — stays AA.
- Motion (§14.2) makes the tiles reveal-on-scroll and the hero headline animate in.

**Open palette question for the user:** references are purple-forward; our brand is navy. Default plan
keeps navy primary + amber + multicolor chart tiles. If the user wants a warmer/more purple-forward
feel, that's a token change (re-run the contrast gate) — flagged, not assumed.
