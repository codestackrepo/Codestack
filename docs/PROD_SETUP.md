# Production setup — mail, superadmin, piston

Everything still outstanding on the live Railway deployment, in the order to do it.
Each step says how to confirm it worked before moving on.

Project `4aec63d1-0bff-40e3-bab7-f14847baddfa` · environment
`f9bbd0a8-0ba7-4a4f-b2e4-b550d14d09f8`

---

## Step 1 — Mail (api AND worker)

Add these **eight variables to BOTH services**. The api enqueues mail; the worker
renders and delivers it, so a worker without them silently sends nothing.

| Variable | Value |
|---|---|
| `EMAIL_ENABLED` | `true` |
| `EMAIL_PROVIDER` | `smtp` |
| `EMAIL_HOST` | `smtp-relay.brevo.com` |
| `EMAIL_PORT` | `587` |
| `EMAIL_USE_TLS` | `true` |
| `EMAIL_USER` | `b40488001@smtp-brevo.com` |
| `EMAIL_PASSWORD` | **copy from `apps/api/.env` line 81** — the `xsmtpsib-…` SMTP key |
| `DEFAULT_FROM_EMAIL` | `codestack <codestackids@gmail.com>` |

`EMAIL_PASSWORD` is Brevo's **SMTP key**, not the account password. It is deliberately
not written here — `apps/api/.env` is gitignored and this file is not, so copy it
straight from there into Railway. Do not paste it into a chat or a tracked file.

**Railway UI:** service → **Variables** → *Raw Editor* takes all eight at once.

### Confirm

Redeploy both. The api log currently says:

```
Mailer disabled (EMAIL_ENABLED=false) — no provider constructed
```

After the change it must say:

```
Mail provider: smtp smtp-relay.brevo.com:587, from=codestack <codestackids@gmail.com>
```

If it still says "disabled", `EMAIL_ENABLED` did not take — check for a stray space or
quotes around `true`.

### Two things that will each bite once

- **`codestackids@gmail.com` must be a validated sender in Brevo**, or the relay
  rejects every message outright.
- **A gmail.com from-address cannot be DKIM-aligned for gmail.** It authenticates as
  Brevo, so it delivers but is far likelier to land in spam. **Check the spam folder**
  before concluding mail is broken. Publishing Brevo's DKIM records on a domain you own
  is the real fix.

---

## Step 2 — SuperAdmin

Open the **api service → Console**:

```
https://railway.com/project/4aec63d1-0bff-40e3-bab7-f14847baddfa/service/aa92bcc6-f219-4899-8d95-3435d3e424ec/console?environmentId=f9bbd0a8-0ba7-4a4f-b2e4-b550d14d09f8
```

You land in `/repo/apps/api`. Run:

```bash
CODESTACK_SUPERADMIN_EMAILS='you@yourdomain.com' \
CODESTACK_SUPERADMIN_PASSWORD='<a strong password>' \
  node dist/database/seeds/seed-superadmin.js
```

### Do NOT use the README's command

`pnpm --filter @codestack/api seed:superadmin` **fails in production**. It runs
`ts-node … src/…`, and the production image has neither: the Dockerfile installs with
`--prod` (so `ts-node`, a devDependency, is absent) and copies only `dist` (so `src`
is not in the image at all).

The `node dist/…` form works — verified: the seed compiles into `dist`, its output uses
relative requires only (no `@/` aliases, so no `tsconfig-paths`), and `argon2` is a
production dependency.

### Expected output

```
created SUPERADMIN you@yourdomain.com (with password)
SuperAdmin bootstrap complete.
```

`promoted … to SUPERADMIN` if that address already has an account. Idempotent — safe to
re-run, and it preserves an existing password.

### Always pass a password

Without `CODESTACK_SUPERADMIN_PASSWORD` the row is created with **no password hash**
and `email_verified_at` left NULL. It cannot sign in at all, and the only recovery is a
password reset — which needs working mail. With a password, the seed stamps
`email_verified_at`, so the account can log in immediately.

### Confirm

```bash
curl -i -X POST https://<api-host>/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@yourdomain.com","password":"<the password>"}'
```

Expect **200** and `Set-Cookie: access_token`. The superadmin console is then at
`/home/platform/organizations`.

---

## Step 3 — Piston

Only if a Piston service exists in the project. Without it, submissions sit `Pending`
forever; with a *wrong* value they also sit `Pending`, which is harder to diagnose — so
confirm the host before setting it.

On **api**:

```
PISTON_URLS = https://<piston-host>/api/v2/execute
```

Find the host on the Piston service → Settings → Networking. Prefer the **private**
domain if there is one (`http://piston.railway.internal:2000/api/v2/execute`) — it
keeps sandbox traffic off the public internet.

### Confirm

Piston needs its language runtimes installed; a fresh instance has none. Check:

```bash
curl https://<piston-host>/api/v2/runtimes
```

You want `python`, `node`, `gcc` and `java` present. If the list is empty, install them
(the `piston-setup` container in `docker-compose.yml` shows the exact POST calls).

---

## Step 4 — Per-org quotas

Organizations created before per-role caps existed have **no quota rows**, which
resolves to unlimited.

Sign in as the superadmin → **Organizations** → pick the org → **Quotas** tab. Set
members, professors, students, problems and assignments.

`null` = unlimited, `0` = blocked. They are different answers everywhere in the stack —
leaving something unlimited should be a decision, not an oversight.

Use the console, not raw SQL: the console goes through the service layer and
invalidates the per-org access cache. A row edited directly in the database is
invisible until you publish the invalidation or restart:

```bash
redis-cli PUBLISH module-access:invalidate '{"orgId":"<uuid>"}'
```

---

## Step 5 — End-to-end check

One action exercises the whole chain — api, Redis, the queue, the worker and Brevo:

**Send a single invite** from the org console.

Watch the api/worker logs for:

```
[MailProcessor] Sending org-admin-invite to <address> (job N)
```

with no error after it. Then check the inbox **and the spam folder**.

If the mail arrives but the link does not work, `WEB_APP_URL` is wrong on the service
that rendered it — remember the worker re-renders on delivery and uses its own copy.

---

## Order matters

Do these one at a time, confirming each:

1. **Mail** → log line changes
2. **Superadmin** → login returns 200
3. **Piston** → runtimes list is non-empty
4. **Quotas** → visible in the console
5. **Invite** → arrives

Mail first because everything else is easier to verify once you can receive a message.
Do not change two things between checks — the whole reason the api was down for two
days is that a single silent misconfiguration is hard to attribute when several land
together.
