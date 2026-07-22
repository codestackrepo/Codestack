# @codestack/api

A scalable, LeetCode-style **coding-education platform backend** built with **NestJS + TypeScript + PostgreSQL**. Professors create coding problems and assignments; students submit code that is judged asynchronously against test cases in an isolated sandbox; staff grade the results.

This is the `apps/api` workspace package in the [CodeStack monorepo](../../README.md).

CodeStack is a from-scratch, concurrency-first backend, architected for horizontal scale (async job queue, worker pool, real-time verdicts) and hardened with best practices (typed config, explicit migrations, RBAC, per-testcase results).

## Features

- **Role-based access** — Admin / Professor / Student (a *grader* is a student granted grading rights in a classroom)
- **Problem management** — problems, test cases (sample/hidden), normalized tags, per-language code templates
- **Classrooms & assignments** — enrollment, assignment status state machine, per-assignment problem import/clone
- **Async code judge** — submissions are queued (BullMQ) and executed on **Piston**; live verdicts over WebSockets with REST polling fallback; per-test-case results
- **Grading** — auto-award points on first *Accepted*, gradebook roll-up, manual override
- **Playground** — public, stateless multi-language code runner

## Tech stack

| Concern | Choice |
|---|---|
| Framework | NestJS 10 (TypeScript, strict) |
| Database | PostgreSQL + TypeORM (explicit migrations) |
| Job queue / cache | BullMQ + Redis |
| Code sandbox | self-hosted [Piston](https://github.com/engineer-man/piston) |
| Realtime | Socket.IO (`/ws/submissions`) |
| Auth | JWT in httpOnly cookies (access + refresh), argon2 |
| Docs | OpenAPI / Swagger (`/api/docs`) |

## Architecture

```
Client ── REST /api/v1 ──▶ API (NestJS)
   ▲                          │  enqueue
   │ WebSocket / poll         ▼
   └──── Redis pub/sub ◀── Worker(s) ──▶ Piston pool (sandbox)
                              │
                          PostgreSQL
```

- The **API** is stateless (scale horizontally behind a load balancer).
- **Workers** consume the `judge` queue and run code on a Piston replica pool, bounded by a global in-flight semaphore.
- Judge progress is published to Redis and relayed to Socket.IO rooms, so clients get live `Pending → Running → Accepted` updates.

## Getting started

### Prerequisites
- Node.js ≥ 20, [pnpm](https://pnpm.io), Docker

### Setup
Run `pnpm install` from the **repo root** (this is a pnpm workspace — one lockfile, one `node_modules` for every app). Everything else below can be run either from the repo root with `pnpm --filter @codestack/api <script>`, or directly from `apps/api/` with the bare `pnpm <script>`.

```bash
# from the repo root
pnpm install
cp apps/api/.env.sample apps/api/.env    # fill in secrets for local dev
docker compose up -d redis piston piston-setup   # Redis + sandbox (installs runtimes)
# Ensure a Postgres database named `code` exists (or point DATABASE_* at your own)
pnpm --filter @codestack/api migration:run    # apply schema
pnpm dev:api                                   # API on http://localhost:3000
pnpm --filter @codestack/api start:worker:dev # judge worker (optional in dev — API also processes jobs)
```

Swagger UI: `http://localhost:3000/api/docs` · Health: `http://localhost:3000/api/v1/health`

### Full stack via Docker
```bash
docker compose up -d           # postgres, redis, piston, api, worker (run from the repo root)
```

## Project layout

```
apps/api/
  src/
    config/         typed, Joi-validated configuration
    common/         base entity, guards, filters, decorators, pagination
    database/       TypeORM data source + migrations
    queue/          BullMQ setup     redis/   shared Redis client
    modules/
      auth/  users/  classrooms/  problems/  assignments/
      submissions/  code-execution/  grading/  playground/  demo/
      ai/  billing/
```

## Scripts

Run any of these from `apps/api/` directly, or as `pnpm --filter @codestack/api <script>` from the repo root.

| Command | Description |
|---|---|
| `start:dev` | Run the API in watch mode |
| `start:worker:dev` | Run a judge worker |
| `migration:generate src/database/migrations/<Name>` | Generate a migration from entity changes |
| `migration:run` | Apply pending migrations |
| `seed` | Idempotent local-dev seed (users, a classroom, a problem, an assignment) |
| `test` / `test:e2e` | Unit / e2e tests |
| `lint` / `typecheck` | Lint / type-check |

## Testing

- **Unit tests** (`pnpm test`) cover the pure/critical logic: verdict classification, output
  normalization, driver-code merging, the judge concurrency semaphore, the assignment status
  state machine, award-on-accept scoring, and the role-escalation guard. No external services
  required.
- **e2e tests** (`pnpm test:e2e`) boot ephemeral Postgres + Redis containers via
  [Testcontainers](https://node.testcontainers.org), apply every real migration, and run the full
  Nest app — auth, RBAC, rate limiting, and the complete async judge pipeline (BullMQ queue → real
  worker → verdict → DB writes → scoring event) — with only the Piston sandbox call itself faked,
  so runs are fast and deterministic. Requires Docker running locally.

Runtime requires **Node ≥ 20** (`engines.node`, matches the Dockerfile's `node:20` base):
Testcontainers' HTTP wait-strategy needs the `File`/`Blob` globals Jest's sandboxed `node` test
environment doesn't forward on its own (bridged via a `setupFiles` polyfill,
`test/utils/jest.setup.ts`, from `node:buffer`); and `pdfjs-dist` v6's Node ("legacy") build throws
`DOMMatrix is not defined` at import time under Node 18 (verified on 18.12.1 and 18.20.6 — even the
newest 18.x patch) but imports and extracts text cleanly under Node 20+. If your default Node is
older, switch via nvm: `nvm use 20`.

## License

See [LICENSE](LICENSE).
