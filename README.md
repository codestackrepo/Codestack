# CodeStack

A scalable, LeetCode-style coding-education platform — professors create coding problems and
assignments, students submit code that is judged asynchronously in an isolated sandbox, staff
grade the results. Includes an AI module that turns notes/PDF/prompts into new, judge-validated
problems, and a Stripe-backed subscription gating that feature.

This is a pnpm workspace monorepo:

```
apps/
  api/    NestJS + TypeScript + PostgreSQL backend — see apps/api/README.md
  web/    React frontend — see apps/web/README.md
```

## Getting started

Prerequisites: Node.js ≥ 20, [pnpm](https://pnpm.io), Docker.

```bash
pnpm install                 # one lockfile, one node_modules, for every app
cp apps/api/.env.sample apps/api/.env    # fill in secrets for local dev
cp apps/web/.env.sample apps/web/.env

docker compose up -d          # postgres, redis, piston, api, worker
pnpm --filter @codestack/api migration:run
pnpm --filter @codestack/api seed        # optional: idempotent demo data

pnpm dev:api                  # API on http://localhost:3000
pnpm dev:web                  # web app on http://localhost:5173
```

See [apps/api/README.md](apps/api/README.md) for backend architecture, scripts, and testing, and
[apps/web/README.md](apps/web/README.md) for the frontend.

## Root scripts

| Command | Description |
|---|---|
| `pnpm dev:api` / `pnpm dev:web` | Run one app in dev mode |
| `pnpm build` | Build every app |
| `pnpm test` | Run every app's test suite |
| `pnpm test:e2e` | Backend e2e suite (Testcontainers) |
| `pnpm lint` / `pnpm typecheck` | Across every app |
| `pnpm --filter @codestack/api <script>` | Run any app-specific script (see that app's README) |

## License

See [LICENSE](LICENSE).
