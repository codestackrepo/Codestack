# CodeStack

**Live app: <https://codestackweb-production.up.railway.app/>**

A multi-tenant, LeetCode-style coding-education platform. Professors author coding problems and
assignments; students submit code that is judged asynchronously in an isolated sandbox; staff grade
the results. Each university/organization is an isolated tenant, and a platform-level SuperAdmin
provisions tenants and controls what each one can use.

This is a pnpm workspace monorepo:

```
apps/
  api/    NestJS + TypeScript + PostgreSQL backend  → apps/api/README.md
  web/    React + Vite frontend                     → apps/web/README.md
docs/
  ui-revamp-roadmap.md   frontend information architecture
```

Design docs live in the GitHub issues, not in `docs/` — each epic's tracking issue carries its
locked decisions, build order and invariants.

---

## Contents

- [System design](#system-design)
- [Tech stack](#tech-stack)
- [Setup](#setup)
- [Transactional mail](#transactional-mail)
- [Database: migrations](#database-migrations)
- [Database: seeding](#database-seeding)
- [Scripts](#scripts)
- [Contributing](#contributing)
- [Troubleshooting](#troubleshooting)

---

## System design

### Runtime topology

```
                          ┌──────────────────────────┐
   Browser (React)        │  API  (NestJS, stateless)│
        │                 │                          │
        │ REST /api/v1 ──▶│  guard chain (per req):  │
        │                 │   1 authn (JWT cookie)   │
        │                 │   2 tenant gate          │
        │                 │   3 RBAC (role rank)     │
        │                 │   4 module access        │
        │                 │   5 feature access       │
        │◀── WebSocket ───│                          │
        │   (verdicts)    └───────┬──────────────────┘
        │                         │ enqueue judge job
        │                         ▼
        │                  ┌─────────────┐        ┌──────────────────┐
        └── Redis pub/sub ◀│  Worker(s)  │───────▶│ Piston pool      │
                           └──────┬──────┘        │ (sandboxed exec) │
                                  │               └──────────────────┘
                           ┌──────▼──────┐
                           │ PostgreSQL  │
                           └─────────────┘
```

The **API is stateless** — scale it horizontally behind a load balancer. **Workers** consume the
`judge` queue and execute code on a Piston replica pool bounded by a global in-flight semaphore.
Judge progress is published to Redis and relayed to Socket.IO rooms, so a client sees
`Pending → Running → Accepted` live, with REST polling as a fallback.

### Multi-tenancy

Every tenant is a row in `organizations`, and most tables carry a denormalized `organization_id`.
There is **no row-level security** — scoping is explicit and opt-in per query, funnelled through one
helper so there is a single place to audit:

- `scopeToOrg(qb, alias, actor)` adds the tenant predicate to a query builder.
- `assertSameOrg(actor, targetOrgId)` is the write-time guard against cross-tenant references.
- The SuperAdmin bypass gates on the **role**, never on `organizationId === null` — a
  mis-provisioned user with no org filters to "matches nothing" instead of seeing everything.

### Roles

| Role | Scope | Notes |
|---|---|---|
| `superadmin` | platform (no org) | The only unconditional bypass. Never a selectable org member. |
| `admin` | one org | Bounded to its own tenant; gateable by a SuperAdmin grant (see below). |
| `professor` | one org | Authors problems/assignments, grades. |
| `student` | one org | Solves and submits. A *grader* is a student granted grading rights in a classroom. |

Gates compare **rank** (`superadmin > admin > professor > student`), so `@Roles(ADMIN)` admits a
SuperAdmin, while `@Roles(SUPERADMIN)` excludes an admin.

### Module & feature permissions (8 layers)

Access to a module (`problems`) or a dotted feature (`problems.author`) resolves through a fixed
precedence — the highest layer that answers wins:

| # | Layer | Owner | Storage |
|---|---|---|---|
| 0 | SuperAdmin bypass | code | `role === superadmin` |
| 1 | SYSTEM modules always on | code | `dashboard`, `profile`, `settings` |
| — | a feature's owning module | code | resolved first, so a feature can't outlive its module |
| 2 | **org grant cap** | SuperAdmin | `org_module_grant.granted = false` — hard false for the whole org, **admin included** |
| 4 | role ceiling | code | non-overridable (students never author or publish grades) |
| 3 | org-admin immunity | code | an *override* can never lock an admin out of its own org |
| 5 | org per-role override | org admin | `module_access` with `org_id` set |
| 6 | platform per-role override | SuperAdmin | `module_access` with `org_id NULL` |
| 7 | org per-role default | SuperAdmin | `org_module_grant.role_defaults` |
| 8 | code default | code | absent ⇒ enabled |

Layer 4 is applied **before** layer 3 on purpose: the immunity exists so an override can't lock an
admin out, not to overrule a code ceiling — otherwise an org admin would inherit SuperAdmin-only
features such as global-catalog authoring.

Denials are distinguishable so the UI can react correctly:

| Response | Meaning | Intended UI |
|---|---|---|
| `403 module_disabled` | the whole area is off for this role/org | redirect away |
| `403 entitlement_required` | the area exists, this capability doesn't | disable the control in place |
| `403 cross_org` | a reference into another tenant | error |
| `409 quota_exceeded` | permitted, but the tenant is full | inline dialog with the numbers |

Resolution is cached in memory per org (lazily loaded, with concurrent-load dedupe) and invalidated
across instances over a Redis pub/sub channel.

### Problem scope

`problems.scope` discriminates the platform catalog from tenant content, enforced by a DB CHECK
(`scope='global' ⟺ organization_id IS NULL`). It is orthogonal to `visibility` (`private|shared`),
which is the intra-org sharing axis:

| scope + visibility | Reach |
|---|---|
| `global` + `shared` | published to every org |
| `global` + `private` | SuperAdmin draft |
| `org` + `shared` | the whole owning org |
| `org` + `private` | the author (and its org admin) |

### Per-org quotas

Numeric limits live in a sparse `org_quotas` table — the numeric sibling of the boolean
entitlements above. Absence is meaningful, and so is zero:

| State | Means |
|---|---|
| no row, or `limit_value IS NULL` | **unlimited** (the common path) |
| `limit_value = 0` | **blocked** |

The two are never conflated: `?? 0` would silently turn every unlimited org into a blocked one.

Enforcement happens **inside the create transaction**, holding a row lock on the org's quota row
(`SELECT … FOR UPDATE`), so two concurrent creates against a limit of N can't both pass at N−1. A
lock taken outside the transaction would be released immediately and the limit would be advisory.
The unlimited path costs one indexed lookup and no count.

Breaching a limit returns **409 `quota_exceeded`** with `limit`, `current`, `attempted` and
`wouldBe` — not a 403. A 403 in this app means "not permitted" and the UI hides or redirects; a full
tenant is permitted-but-full, so the client gets the numbers and shows them inline.

Seats (`max_users`) count active members **plus pending invites**, so reserving at invite time makes
acceptance net-zero and an org can't oversubscribe by minting invites.

### Not yet built

No endpoint sets a quota limit yet (the service method exists; the SuperAdmin console will call
it). SMTP invite onboarding, bulk CSV/XLSX enrolment and password reset are in flight — see the
`epic:declerk` tracking issue. The **AI** (notes/PDF → generated problems) and **Stripe billing**
modules exist in the tree but are deliberately **not registered** in `app.module.ts`, so their
endpoints are absent at runtime.

---

## Tech stack

| Concern | Choice |
|---|---|
| Backend | NestJS 10, TypeScript (strict) |
| Frontend | React 19, Vite, TanStack Query, Tailwind |
| Database | PostgreSQL 16 + TypeORM (explicit migrations, never `synchronize`) |
| Queue / cache / pub-sub | BullMQ + Redis 7 |
| Code sandbox | self-hosted [Piston](https://github.com/engineer-man/piston) |
| Realtime | Socket.IO (`/ws/submissions`) |
| Auth | Local email + password: argon2 + JWT in httpOnly cookies (one path, no third party) |
| API docs | OpenAPI / Swagger at `/api/docs` |

---

## Setup

### Prerequisites

Node.js ≥ 20, [pnpm](https://pnpm.io), Docker.

### 1. Install and configure

```bash
pnpm install                                    # one lockfile, one node_modules, all apps
cp apps/api/.env.sample apps/api/.env
cp apps/web/.env.sample apps/web/.env
```

Then edit `apps/api/.env`. The minimum for local dev:

```ini
DATABASE_HOST=localhost
DATABASE_NAME=code                     # must match what docker compose creates
REDIS_HOST=localhost
JWT_ACCESS_SECRET=<any long random string>
JWT_REFRESH_SECRET=<a different long random string>
CORS_ORIGINS=http://localhost:5173     # must match the web dev-server origin
```

Config is validated by Joi at boot, so a missing required value fails fast with a named error rather
than at first use. The five values above are the only ones a fresh clone needs; everything else in
`.env.sample` has a working default.

### 2. Start infrastructure

```bash
docker compose up -d postgres redis piston piston-setup
```

`piston-setup` is a one-off container that installs the Python, Node, C++ (gcc) and Java runtimes
into Piston through its package API, then exits — expect it to take a few minutes on first run.

The `postgres` service creates a database named **`code`**, so `DATABASE_NAME` must match it. Point
`DATABASE_*` at your own instance instead if you'd rather not run Postgres in Docker.

To run the API and worker in Docker too, use `docker compose up -d` (they read `apps/api/.env` and
override the hosts to the compose service names).

### 3. Migrate, seed, run

```bash
pnpm --filter @codestack/api migration:run
pnpm --filter @codestack/api seed          # optional demo data

pnpm dev:api    # API  → http://localhost:3000/api/v1  (docs at /api/docs)
pnpm dev:web    # web  → http://localhost:5173
```

---

## Transactional mail

Invites, invite reminders, org-assignment notices and password resets are queued to BullMQ
(`QUEUE_MAIL`) and delivered by `MailProcessor`. Delivery sits behind a provider seam, chosen with
`EMAIL_PROVIDER`.

> **Naming.** "Resend" is overloaded in this repo. `EMAIL_PROVIDER=resend` and `ResendMailTransport`
> mean **Resend the email provider** (resend.com). `POST /invites/:id/resend`, `resendPending` and
> `InviteResendCooldownException` mean **re-sending an invite** and have nothing to do with it. Don't
> let a grep conflate the two.

### Local development — mailpit (the default)

```bash
docker compose up -d mailpit     # SMTP sink on :1025, web UI on http://localhost:8025
```

Then set `EMAIL_ENABLED=true` in `apps/api/.env`. The `.env.sample` defaults already point at
mailpit, so no credentials and no outbound network access are needed — every message lands in the
web UI, invite links included.

With `EMAIL_ENABLED=false` (the default) nothing is sent and no provider is constructed at all: the
mailer logs the rendered text body instead, and **only outside production**, so a deployment that
forgets the flag never writes invite tokens to its log. A disabled mailer never needs a credential.

### Production — Resend over its HTTP API

```dotenv
EMAIL_ENABLED=true
EMAIL_PROVIDER=resend
RESEND_API_KEY=<a sending-only key>
DEFAULT_FROM_EMAIL=no-reply@<a domain you have verified in Resend>
EMAIL_RATE_MAX=<see below — required for this provider>
```

Four things that will each bite once:

- **The from-address must be on a domain verified in Resend, or every send answers 403.** Verifying
  means adding Resend's DNS records to a zone **you** control, so a platform-provided host (a
  `*.up.railway.app` subdomain, for instance) can never be verified. `onboarding@resend.dev` works
  without verification but delivers only to the Resend account owner's own address — a smoke test,
  not an invite path.
- **`EMAIL_RATE_MAX` has no default for this provider** and Joi requires it. The 20/s that suits
  mailpit and a real SMTP relay is far above a typical Resend account limit, and inheriting it
  silently is what produces a 429 storm on the first bulk roster import. Resend's real
  `POST /emails` limit is not the one its read endpoints report, so `ResendMailTransport` logs the
  observed limit once on the first successful send; set this to at most half of it. The BullMQ
  limiter is **Redis-global** — the cap across every worker pod, not per pod — and any other Resend
  API traffic shares the same account budget.
- **Use a sending-only API key.** A full-access key can create and revoke domains and other keys,
  which delivery never needs. The key must never reach a log: the transport builds every message
  from the response alone and scrubs anything key-shaped out of provider-supplied text, and
  `pnpm check:invariants` pins the three files allowed to read it.
- **Failures are classified.** `429`, `408` and `5xx` throw, so BullMQ retries on its backoff.
  `422` (invalid recipient), `403` (unverified domain) and other `4xx` are *terminal*: the job is
  logged at error level, its credential is scrubbed, and it completes without burning the remaining
  attempts — retrying an unverified domain five times over eight minutes changes nothing.

If the HTTP API ever has to be abandoned, Resend also speaks SMTP and that needs no code change:
`EMAIL_PROVIDER=smtp`, `EMAIL_HOST=smtp.resend.com`, `EMAIL_PORT=465`, `EMAIL_USER=resend`,
`EMAIL_PASSWORD=<the api key>`.

---

## Database: migrations

Schema changes are **always** explicit migrations — `synchronize` is off everywhere, including
tests. Migrations run in one monotonic timestamp sequence, and a CI check fails the build on a
duplicate timestamp or a filename/classname mismatch (a common copy-paste slip).

```bash
pnpm --filter @codestack/api migration:run        # apply everything pending
pnpm --filter @codestack/api migration:revert     # roll back the most recent one
pnpm --filter @codestack/api check:migrations     # guard the timeline (run before pushing)
pnpm --filter @codestack/api migration:generate src/database/migrations/<Name>
```

House conventions worth knowing before adding one:

- **Enums are `varchar` + a CHECK constraint**, never PG `enum` types — adding a value must not need
  `ALTER TYPE`.
- **Add a CHECK after the backfill**, never before, so a migration can't fail half-applied.
- **`down()` must actually revert.** Where a forward migration widens a column or relaxes a CHECK,
  `down()` has to delete the now-invalid rows first, or the revert fails on real data.
- New timestamps continue the round-epoch sequence (`1785500000000`, …), not `Date.now()`.

---

## Database: seeding

All seeds are **idempotent** — they check for an existing row by its natural key before inserting,
so re-running is safe.

| Command | What it creates |
|---|---|
| `pnpm --filter @codestack/api seed` | Admin, professor, 3 students, a classroom, a problem with test cases + templates, one active assignment |
| `pnpm --filter @codestack/api seed:catalog` | A larger problem catalog |
| `pnpm --filter @codestack/api seed:deadlines` | 5 active assignments spread across the dashboard's deadline buckets |
| `pnpm --filter @codestack/api seed:superadmin` | Promotes `CODESTACK_SUPERADMIN_EMAILS` to org-less SUPERADMIN |

Demo users are created in the seeded "Legacy University" tenant. The password lives in
`apps/api/src/database/seeds/run-seed.ts` (`PASSWORD`), and their emails are printed when the seed
finishes.

SuperAdmin bootstrap:

```bash
CODESTACK_SUPERADMIN_EMAILS=you@example.com \
CODESTACK_SUPERADMIN_PASSWORD='<strong password>' \
  pnpm --filter @codestack/api seed:superadmin
```

This is idempotent and safe to re-run: it promotes an existing user in place and keeps their
password. Omitting `CODESTACK_SUPERADMIN_PASSWORD` creates the row with **no** password hash, which
cannot sign in at all until a password reset — set one unless you mean that.

This seed is the **only** way a SUPERADMIN comes into existence. Self-registration, invite
acceptance and `PATCH /users` all refuse the role, and `chk_users_org_required` refuses a
`superadmin` row that carries an `organization_id`.

---

## Scripts

From the repo root:

| Command | Description |
|---|---|
| `pnpm dev:api` / `pnpm dev:web` | Run one app in watch mode |
| `pnpm build` | Build every app |
| `pnpm test` | Every app's unit suite |
| `pnpm test:e2e` | Backend e2e suite (Testcontainers — needs Docker) |
| `pnpm lint` / `pnpm typecheck` | Across every app |
| `pnpm --filter @codestack/api <script>` | Any app script (see that app's README) |

`pnpm lint` runs `eslint --fix` and will reformat files across the repo — stage your own changes
first so the two don't get mixed together.

---

## Contributing

### Workflow

Work is tracked as GitHub issues, one branch and one PR per issue.

1. **Pick an issue and check it isn't blocked.** Issues list their blockers
   (`Blocked by: #48, #56`); the platform work is dependency-ordered, so building on an unmerged
   dependency means reworking it. The roadmap issue tracks the intended order.
2. **Branch off an up-to-date `main`:**
   ```bash
   git fetch origin && git checkout -b feat/<issue>-<short-slug> origin/main
   ```
   `feat/64-module-feature-hierarchy`, `fix/105-users-role-escalation` — `feat/` or `fix/`, the
   issue number, then a slug.
3. **Read the issue and its epic's tracking issue before writing code.** The tracking issue carries
   the locked decisions and the cross-cutting invariants, and it assigns a **single owner per shared
   file** — if a file belongs to another subsystem, add a new file rather than editing across that
   boundary.
4. **Verify before pushing** (see the checklist below).
5. **Open a PR** whose body says `Closes #<issue>`, states what changed and *why*, and records how
   it was verified. Call out any deliberate deviation from the plan and the reason — reviewers read
   the plan and will otherwise flag it as a bug.
6. **Merge with a merge commit** (`gh pr merge <n> --merge --delete-branch`), which is what the
   history uses. The issue closes itself via `Closes #`.

### Pre-push checklist

```bash
pnpm --filter @codestack/api typecheck
pnpm --filter @codestack/api test
pnpm --filter @codestack/api check:migrations     # if you added a migration
npx eslint <the files you touched>                # NOT `pnpm lint` — see below
```

Run `eslint` on **your files only**. The repo-wide `pnpm lint` applies `--fix` everywhere and will
sweep unrelated files into your diff.

If you added a migration, also apply it, **revert it, and apply it again** against a real database.
A `down()` that has never run is a `down()` that doesn't work, and several here must delete rows
before they can narrow a column or a CHECK.

### Commit messages

Conventional commits with a scoped area, referencing the issue:

```
feat(api/access): org-scoped module/feature hierarchy + FeatureGuard (#64)
fix(api/seeds): seed:superadmin silently reset an existing password every re-run
docs: rewrite README — live URL, system design, setup, contributing
```

Scopes follow the code: `api/platform`, `api/auth`, `api/seeds`, `web/auth`, `migrations`, `docs`.
Bodies explain the *reasoning* — the non-obvious constraint, the failure mode avoided, the tradeoff
taken — not a restatement of the diff.

### Code conventions

- **Comments carry the why.** The house style documents constraints and rejected alternatives at the
  point of the decision (see `module-access.service.ts`), so the next reader doesn't re-litigate it.
- **Fail closed.** An unknown key, a missing gate, an unreachable dependency should deny, not allow.
  Guards deny on missing metadata where a miss would be an access hole.
- **Tenancy is explicit.** Any new query over tenant data goes through `scopeToOrg`; any resolved
  foreign row goes through `assertSameOrg`. There is no RLS to catch a miss.
- **Never coalesce a meaningful NULL.** `NULL` (unlimited / unset) and `0` (blocked) are different
  answers; `?? 0` silently merges them.
- **Tests name the behaviour, not the method.** Prefer
  `it('a revoked grant gates the org ADMIN too')` over `it('returns false')`.

---

## Troubleshooting

**`403 module_disabled` on a route that used to work** — a module was turned off for that role or
org. Check `GET /api/v1/module-access/me` for the actor's effective module and feature maps.

**A permission change didn't take effect** — resolution is cached per org in memory. Writes through
the API invalidate it automatically (and publish to other instances); a change made directly in SQL
needs `redis-cli PUBLISH module-access:invalidate '{"orgId":"<uuid>"}'`, or a restart.

**Submissions stay `Pending`** — no worker is consuming the queue (`pnpm --filter @codestack/api
start:worker:dev`), or Piston has no runtimes installed (re-run the `piston-setup` container).

**Migration revert fails** — a `down()` is refusing to narrow a column or CHECK because rows now
violate it. Read that migration's `down()`; several delete the offending rows first by design.

---

## License

Private and unlicensed (`"license": "UNLICENSED"`, `"private": true`) — all rights reserved. There
is no `LICENSE` file in the repo; the previous link here pointed at one that doesn't exist.
