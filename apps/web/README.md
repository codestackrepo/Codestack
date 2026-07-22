# @codestack/web

The CodeStack React frontend. This is the `apps/web` workspace package in the
[CodeStack monorepo](../../README.md).

## Tech stack

| Concern | Choice |
|---|---|
| Framework | React 19 + Vite, TypeScript (strict) |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`, CSS-first `@theme` config) |
| Components | shadcn/ui (Radix primitives, Lucide icons) |
| Routing | react-router-dom |
| Server state | TanStack Query over a typed axios client |
| Forms | react-hook-form + zod |
| Realtime | socket.io-client |
| Code editor | @monaco-editor/react + react-resizable-panels |

## Design tokens

Primary is sky-800 (`hsl(203 90% 28%)`); the brand accent is a warm orange
(`hsl(27 96% 61%)`), kept as a separate `--brand`/`--brand-foreground` pair
from shadcn's own `--accent` (which built-in components use for hover
states) — see `src/index.css`. Dark mode flips `--primary` to a light
neutral rather than keeping sky-800, since a dark blue on an already-dark
background loses contrast. Font is Inter throughout.

## Getting started

From the **repo root**:

```bash
pnpm install
cp apps/web/.env.sample apps/web/.env
pnpm dev:web        # http://localhost:5173, proxies /api/v1 and /ws to the backend on :3000
```

Or from `apps/web/` directly with the bare `pnpm <script>`.

## Scripts

| Command | Description |
|---|---|
| `dev` | Vite dev server |
| `build` | Type-check (project references) + production build |
| `lint` | ESLint (flat config) |
| `typecheck` | `tsc -b --noEmit` across both tsconfig projects |
| `format` | Prettier |

## Adding shadcn components

```bash
npx shadcn@latest add <component> --yes
```

If a component's `@/lib/utils` or similar shared file is ever missing after
an `add`, the CLI needs `compilerOptions.paths` on the **root** `tsconfig.json`
(not just `tsconfig.app.json`) to resolve the `@/*` alias — this project
already has both set for that reason.
