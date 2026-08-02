# Deployment (Railway)

How CodeStack is deployed, what a redeploy does on its own, and the few things it
does **not** do for you.

- [Topology](#topology)
- [Environment variables](#environment-variables)
- [Deploying](#deploying)
- [Migrations](#migrations)
- [After a deploy](#after-a-deploy)
- [Verifying](#verifying)
- [Rollback](#rollback)
- [Troubleshooting](#troubleshooting)

---

## Topology

Four things must be running. Three are services you deploy; one is managed.

| Service | Command | Why it exists |
|---|---|---|
| **api** | `./docker-entrypoint.sh` → `node dist/main.js` | HTTP + WebSocket. **Runs migrations on boot.** |
| **worker** | `node dist/worker.js` | Drains the `judge` and `mail` queues. Nothing sends mail or grades a submission without it. |
| **web** | static build (Vite) | The React app. |
| **postgres / redis** | managed | Redis is not just a cache — it is the queue and the cross-instance access-cache invalidation bus. |

`piston` (the code sandbox) is self-hosted separately and pointed at by `PISTON_URLS`.

**The worker is easy to forget and fails silently.** The API only *enqueues* mail;
the worker renders and delivers it. If the worker is missing or running an older
image than the API, invites queue up and never arrive, and nothing errors on the
API side.

---

## Environment variables

### Fails to boot without these

Only two are unconditionally required by Joi. Everything else has a default, which
is what makes a redeploy of an existing deployment safe.

```dotenv
JWT_ACCESS_SECRET=<32+ chars>
JWT_REFRESH_SECRET=<32+ chars, different from the above>
```

### Fails to boot in production without these

`main.ts` fails closed on four things rather than degrading silently. Each of these
is a real outage disguised as a working deploy:

```dotenv
NODE_ENV=production
AUTH_COOKIE_SECURE=true          # else auth cookies travel over plaintext HTTP
CORS_ORIGINS=https://your-web-origin   # explicit allow-list; a wildcard + credentials
                                       # lets any origin read authenticated responses
WEB_APP_URL=https://your-web-origin    # every mailed link is built from this. A
                                       # loopback value here is not degraded — the mail
                                       # sends, the link is unreachable, nothing errors
```

> **`WEB_APP_URL` must be set on BOTH `api` and `worker`.**
>
> It is the single most common deploy failure here, and it fails in two different ways:
>
> - On **api**, omitting it is a hard boot failure. It has a *default* of
>   `http://localhost:5173`, so an unset variable does not error as "missing" — the app
>   starts up, resolves the dev default, and `main.ts` then refuses to boot. The
>   healthcheck fails and Railway keeps the previous deployment live, so the service
>   looks fine while every new release silently fails to land.
> - On **worker**, omitting it is silent and worse. The worker re-renders mail at
>   delivery, so it builds links from *its own* copy of this variable. An api with the
>   right value and a worker without it sends mail whose links point at localhost, and
>   nothing anywhere reports an error.
>
> Set it to the same value as `CORS_ORIGINS` when there is a single web origin.
> `docker-compose.yml` sets it explicitly on both services for exactly this reason.

### Infrastructure

```dotenv
DATABASE_URL=...                 # or the DATABASE_* parts individually
DATABASE_SSL=false               # false is correct for Railway's PRIVATE network,
                                 # where traffic never leaves the project. Set true
                                 # only when reaching Postgres over the public
                                 # internet (an external host, or a public proxy URL)
REDIS_HOST=... REDIS_PORT=... REDIS_PASSWORD=...
PISTON_URLS=https://<piston-host>/api/v2/execute
```

### Mail

Production runs **Brevo**, which is an ordinary authenticated SMTP relay and needs no
provider-specific code:

```dotenv
EMAIL_ENABLED=true
EMAIL_PROVIDER=smtp              # DEFAULT — an existing deployment that never sets
                                 # this keeps behaving exactly as before
EMAIL_HOST=smtp-relay.brevo.com
EMAIL_PORT=587
EMAIL_USE_TLS=true
EMAIL_USER=<login>@smtp-brevo.com
EMAIL_PASSWORD=<the xsmtpsib-… SMTP key, NOT the account password>
DEFAULT_FROM_EMAIL=codestack <you@yourdomain>
```

Two things that each bite once:

- **The from-address must be a validated sender in Brevo**, or the relay rejects the
  message outright.
- **A from-address on a domain you don't control cannot be DKIM-aligned for it.** A
  `gmail.com` sender authenticates as Brevo rather than as gmail — it delivers, but is
  far likelier to land in spam.

Switching to Resend is a config change, but it makes three variables **required**:
`EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, and `EMAIL_RATE_MAX`. The last has no
default on purpose — the SMTP default of 20/s is far above a typical Resend account
limit, and inheriting it silently is what produces a 429 storm on the first bulk
roster import. See the Resend section of the root README before switching.

---

## Deploying

Railway builds from `main` on push. To deploy an already-merged commit:
**Dashboard → service → Deployments → Redeploy.**

**Deploy all three services** (`api`, `worker`, `web`) from the same commit. A worker
running older code than the API is the failure mode described above.

Order does not matter — migrations here are additive, so an older worker against a
newer schema still runs. If a future release adds a *destructive* migration, deploy
the worker first and the API (which migrates) last.

---

## Migrations

**They run automatically.** `apps/api/docker-entrypoint.sh` runs
`pnpm run migration:run:prod` before starting the server:

```
[entrypoint] Running database migrations...
[entrypoint] Migrations complete. Starting API...
```

Two properties make this safe:

- **Idempotent.** Applied migrations are tracked in `typeorm_migrations` and skipped,
  so re-running on every deploy is a no-op.
- **Single-writer.** Only the API image reaches this script. The worker service
  overrides the CMD with `node dist/worker.js`, so two processes can never race to
  migrate.

`synchronize` is off everywhere, including tests. Schema only ever changes through an
explicit migration.

Before pushing a release that adds one, run `pnpm --filter @codestack/api
check:migrations` — CI fails the build on a duplicate timestamp or a
filename/classname mismatch, which is a common copy-paste slip.

---

## After a deploy

Two things a redeploy will **not** do. Both are silent.

### 1. Set quotas on organizations created before per-role caps existed

New tenants get all four caps at approval. Tenants that predate that migration have
**no quota rows at all**, which resolves to unlimited.

Fix per org: **Superadmin → Organizations → *org* → Quotas**, and set members,
professors, students, problems and assignments.

`null` means **unlimited** and `0` means **blocked** — they are not interchangeable
anywhere in the stack. Leaving a resource unlimited is a decision; make it
deliberately.

### 2. Bootstrap a SuperAdmin, if there isn't one

This is the only way a SUPERADMIN comes into existence — self-registration, invite
acceptance and `PATCH /users` all refuse the role.

```bash
CODESTACK_SUPERADMIN_EMAILS=you@example.com \
CODESTACK_SUPERADMIN_PASSWORD='<strong password>' \
  pnpm --filter @codestack/api seed:superadmin
```

Idempotent — it promotes an existing user in place and keeps their password. Without
a superadmin, organization applications still save but nobody can review them, and
the API logs `NO active superadmin exists to review it`.

---

## Verifying

```bash
# an existing account still signs in (proves the verification backfill worked)
curl -i -X POST https://<api>/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"...","password":"..."}'

# the session contract carries the quota block
curl -b cookies.txt https://<api>/api/v1/auth/verify
```

Then **send one real invite**. That single action exercises the API, Redis, the queue,
the worker and Brevo end to end — nothing else covers that whole path.

Watch the API log for `[MailProcessor] Sending <template> to <address>` with no error
after it.

---

## Rollback

Redeploy the previous Railway deployment.

**Migrations do not roll back with it.** Each has a `down()`, but reverting is a
deliberate manual step, newest first:

```bash
pnpm --filter @codestack/api migration:revert    # once per migration
```

Several `down()` methods **delete rows** before narrowing a column or a CHECK, because
a revert would otherwise fail against real data. Read the migration before reverting it.

In practice the current schema is additive, so an older image runs against the newer
schema without a revert. **Take a Railway database snapshot before deploying** — that
is the cheap insurance that makes the rest of this section rarely needed.

---

## Troubleshooting

**Every deploy fails its healthcheck but the service still looks healthy.** Railway
keeps the last *good* deployment serving traffic when a new one fails to become
healthy, so the app stays up on old code while releases pile up failing. Read the
deploy log of the failed attempt, not the service status. This has happened here: a
missing `WEB_APP_URL` on `api` blocked eight consecutive releases over two days while
the service continued serving a two-day-old commit.

**Boot fails with a config error.** Joi validates at startup and names the variable.
The four production fail-closed checks are listed above; each error message says what
to set and why. Note that a variable with a *default* — `WEB_APP_URL` is the one that
bites — never reports as missing; it resolves to the dev default and then trips the
production check.

**Services drift onto different commits.** Check **Settings → Source → auto deploy**
before blaming watch paths. A service with auto deploy *disabled* shows nothing at all
in its deployment history — not even skipped builds — so it looks idle rather than
misconfigured, and it can sit weeks behind without any signal. This has happened here:
`web` stayed seven days behind on a stale frontend while its watch path
(`/apps/web/**`) was perfectly correct.

**"Redeploy" does not advance a stale service.** It rebuilds the *same commit* that is
already active. To move a service forward you need a new deployment from the branch —
re-enable auto deploy, or push a commit that touches its watch path. Redeploying a
service that is behind and expecting it to catch up is a silent no-op.

**Nobody can log in after a release that added email verification.** Login refuses
while `email_verified_at IS NULL`. Migration `1785590000000` backfills
`email_verified_at = created_at`, grandfathering every pre-existing account. If that
migration did not run, the entrypoint log will say so.

**Invites never arrive.** In order: is the **worker** service running? Is
`EMAIL_ENABLED=true`? Is the from-address a validated sender in Brevo? Check the
worker log for `MailProcessor`. Also check spam — see the DKIM note above.

**Submissions stay `Pending`.** No worker consuming the `judge` queue, or Piston has
no language runtimes installed.

**A permission change didn't take effect.** Module/feature resolution is cached per
org in memory and invalidated across instances over Redis pub/sub. A change made
directly in SQL bypasses that — publish manually or restart:

```bash
redis-cli PUBLISH module-access:invalidate '{"orgId":"<uuid>"}'
```

**Mailed links point at localhost.** `WEB_APP_URL` is wrong. In production the API
refuses to boot on a loopback value, so this only happens if it is set to some other
incorrect origin.
