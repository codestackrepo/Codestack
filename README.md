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
  PLATFORM-PLAN.md   multi-tenancy / SuperAdmin / Clerk / quotas design
  REDESIGN.md        frontend information architecture
```

---

## Contents

- [System design](#system-design)
- [Tech stack](#tech-stack)
- [Setup](#setup)
- [Database: migrations](#database-migrations)
- [Database: seeding](#database-seeding)
- [Clerk setup (in detail)](#clerk-setup-in-detail)
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
        │                 │   1 authn (Clerk | JWT)  │
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

### Not yet built

Per-org **quotas**, Clerk-invitation onboarding and CSV bulk enrolment are designed in
`docs/PLATFORM-PLAN.md` but not implemented — `GET /auth/verify` returns `quotas: null` today. The
**AI** (notes/PDF → generated problems) and **Stripe billing** modules exist in the tree but are
deliberately **not registered** in `app.module.ts`, so their endpoints are absent at runtime.

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
| Auth | **Clerk** (Bearer) *or* legacy JWT httpOnly cookies + argon2 — both at once |
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
than at first use. **Every Clerk key is optional** — with them unset the app runs entirely on JWT
cookies, so a fresh clone boots without a Clerk account.

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

> **Pick a password that Clerk will also accept.** Clerk rejects any password found in a public
> breach corpus *at sign-in*, so a weak-but-convenient demo password can pass local argon2 login and
> still be refused by Clerk with "this password has been found as part of a breach". See
> [Clerk setup](#clerk-setup-in-detail).

SuperAdmin bootstrap:

```bash
CODESTACK_SUPERADMIN_EMAILS=you@example.com \
CODESTACK_SUPERADMIN_PASSWORD='<strong password>' \
  pnpm --filter @codestack/api seed:superadmin
```

This is idempotent and safe to re-run: it promotes an existing user in place (keeping their
password), and when Clerk is configured it also stamps that Clerk user's
`publicMetadata.role = 'superadmin'`. If the person has no Clerk account yet, **re-run the seed after
they sign up** — the webhook only promotes a signup that already carries the metadata.

---

## Clerk setup (in detail)

Auth is **dual-mode**. The API accepts either a Clerk Bearer token *or* the legacy JWT cookie, and
both work simultaneously — so Clerk can be adopted (or skipped) without a cutover. Skip this whole
section to develop on cookie auth.

In every case the **local database is authoritative** for `role` and `organizationId`. A Clerk token
is only proof of identity; the API resolves the local user by `clerk_user_id` and reads permissions
from the DB, never from token claims. Clerk org membership is therefore optional.

### 1. Create the application

1. Create a Clerk application (a **development** instance is fine locally).
2. Copy the keys into your env files:

   ```ini
   # apps/api/.env
   CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...

   # apps/web/.env  — presence of this switches the frontend into Clerk mode
   VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
   ```

3. Restart both apps. The API activates the Clerk Bearer path; the web app renders Clerk's sign-in.

### 2. Instance settings that will bite you

These live in the Clerk dashboard, not in code. Every one below produced a real, confusing failure:

| Setting | Symptom if wrong | What to do |
|---|---|---|
| **Email as a sign-in identifier** | `form_param_format_invalid: Identifier is invalid` for a correct email | Keep *Email address* enabled **and** marked "used for sign-in". If only username is, users must sign in with their username instead. |
| **Compromised-password rejection** | Correct password → "This password has been found as part of a breach", forced reset | Use a password that isn't in a breach corpus. The check runs **at sign-in**, so an imported hash and a Backend-API `verifyPassword` both pass while the UI still refuses. |
| **Username required** | Every Backend-API `createUser` fails `422 form_data_missing` | Either don't require usernames, or let the import script supply one (it retries with a name derived from the email). |
| **Email-code MFA** | Password accepted, then `needs_second_factor` with an emailed code | Turn it off for demo tenants, or use real mailboxes. A fake domain can never receive the code, and Clerk's dev bypass code works only for `+clerk_test` addresses. |
| **Force organization selection** | After sign-in, "Setup your organization" blocks the session | Turn it off — this app never reads org membership from Clerk. Creating an org there makes a Clerk-only org with no local counterpart. |

### 3. Webhook (keeps the local mirror in sync)

Add a webhook endpoint pointing at `POST {API_URL}/api/v1/webhooks/clerk` and subscribe to:

```
user.created                      user.updated                      user.deleted
organization.created              organization.updated              organization.deleted
organizationMembership.created    organizationMembership.updated    organizationMembership.deleted
organizationInvitation.created    organizationInvitation.accepted   organizationInvitation.revoked
```

Copy the endpoint's signing secret into `CLERK_WEBHOOK_SIGNING_SECRET`. Handlers are **idempotent and
order-tolerant** (deliveries are deduped through a `webhook_events` ledger), so a redelivery or an
out-of-order event is safe.

Locally, Clerk can't reach `localhost` — expose it with a tunnel (`cloudflared tunnel --url
http://localhost:3000`, ngrok, etc.) and use that hostname in the endpoint URL. Without a tunnel
everything still works; the local mirror just isn't updated by Clerk-side changes.

### 4. Organization roles (optional)

If you do use Clerk organizations, local roles map to Clerk org roles as
`admin → org:admin`, `professor → org:professor`, `student → org:member`. **`org:professor` is a
custom role you must create in the dashboard**, or adding a professor to an org silently fails.

### 5. Importing existing users

To move users who already have local argon2 passwords into Clerk:

```bash
pnpm --filter @codestack/api import:clerk -- --dry-run   # offline preview, zero Clerk calls
pnpm --filter @codestack/api import:clerk                # create + link
pnpm --filter @codestack/api import:clerk -- --limit=50  # staged rollout
```

It imports the **password digest**, so users keep their existing password — and because a digest is
imported rather than validated, a password Clerk's strength policy would reject as plaintext still
migrates. Already-linked users are skipped, and an existing Clerk account for the same email is
linked rather than duplicated, so the script is re-runnable. Pass `--sync-password` to push the local
digest onto an account that already exists in Clerk (off by default — it overwrites a live
credential).

The legacy argon2 login path stays live throughout; the script only adds `clerk_user_id`. Verify
sign-in for imported users **before** running the gated migration that drops password auth.

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
   `feat/64-module-feature-hierarchy`, `fix/clerk-import-username-sync` — `feat/` or `fix/`, the
   issue number, then a slug.
3. **Read the design section the issue points at** in `docs/PLATFORM-PLAN.md` before writing code.
   Issues cite it (`Plan ref: §5.5`), and the plan also assigns a **single owner per shared file** —
   if a file belongs to another subsystem, add a new file rather than editing across that boundary.
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
fix(api/seeds): demo password Clerk will actually accept at sign-in
docs: rewrite README — live URL, system design, setup, Clerk guide
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
