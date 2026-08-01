# Resend provider seam (#118) + open/closed onboarding & role-origin architecture — implementation plan

Repo: `C:\Users\harsh\Desktop\Codestack` (NestJS API `apps/api`, React+Vite `apps/web`, pnpm workspace, TypeORM+Postgres, BullMQ+Redis).
Planning only — no source file was changed. Every file/line reference below was read in this session.

> **REVISION 3.** Locked decisions: admin→professor = **flat flip** (§3); **no login until verified**; from-address **stays pure env** (§2.5 Railway note); **origin model = O2** (community tenant + immutable `users.origin` provenance — chosen by the human after the trade-off review; §4 is now a decision record, §15.6 re-tests it against org self-signup and it stands). New scope folded in: **organisation self-signup** (§15), **per-role seat counts** (§16), **toasts everywhere** (§17).
>
> ### What you are approving
> **Nothing ships — including P0 — until this document is approved end to end.** The shape: a provider seam that makes Resend the production mail sender (#118, ships first and alone); email verification built from scratch; a two-way ecosystem — closed tenants created by public organisation applications that a superadmin approves with per-role seat caps (admins then invite professors and students, professors invite students), and an open side where students self-signup into a platform-operated community tenant and professors apply for superadmin review; plus co-branded UI/mail for tenant members, a full toast pass, and the migrations/tests/security work each piece needs. **Total realistic effort: 25–36 focused dev-days (≈ 6–8 calendar weeks for one developer with review overhead); nine phases, each independently shippable with its own gate (§13).** Two items are **externally blocked, not missing work**: Resend domain verification needs DNS records on a self-owned zone (the Railway `*.up.railway.app` host cannot be verified), and the real send-rate limit can only be read from a live `POST /emails` response after that — both sit in P0's gate as open external steps (§2.5, §2.6).

---

## 0. Ground-truth verification — corrections and confirmations

Everything in the brief's PART C checked out, with these refinements:

1. **CONFIRMED, and worse than stated: `EMAIL_RATE_MAX` / `EMAIL_RATE_DURATION_MS` are dead knobs.**
   Traced every consumer: `apps/api/src/config/configuration.ts:114-115` parses them into `EmailConfig.rateMax/rateDurationMs`; `config/env.validation.ts:88-89` validates them; `mail.service.spec.ts:39-40` and `mail.transport.spec.ts:20-21` set them in fixtures; `.env.sample:90-91` documents them. **No production code reads `cfg.rateMax` anywhere.** The only value that binds the worker is the hardcoded decorator literal at `apps/api/src/modules/mail/mail.processor.ts:27`:
   `@Processor(QUEUE_MAIL, { concurrency: 4, limiter: { max: 20, duration: 1000 } })`.
   An operator setting `EMAIL_RATE_MAX=5` still gets 20/s. #118's "tune the rate limiter" item is a no-op unless this is fixed — it gets its own work item (§2.4).
   Same shape exists for `JUDGE_QUEUE_RATE_MAX` (`judge.processor.ts:18` hardcodes `{max:100}`; `judgeConfig.queueRateMax` has no reader). Out of scope here — file a separate issue so it isn't "fixed" accidentally.

2. **Stale comment in `mail.processor.ts`:** the class header (lines 24-26) says concurrency "is set from config in onModuleInit, matching JudgeProcessor", but the actual hook is `onApplicationBootstrap` (lines 47-50, with the correct race explanation). Fix the header while touching the file in Phase 0.

3. **Transport construction today is NOT in `mail.module.ts`** — `mail.module.ts` wires nothing; `MailService.deliver()` lazily builds the nodemailer transport at `mail.service.ts:101` *after* the `enabled` check (line 94). So the "disabled mailer constructs no provider" property already holds; Phase 0 moves construction into a DI factory in `mail.module.ts` per the issue, and must preserve that property.

4. **No config-redaction surface exists.** `nestjs-pino` is in `package.json` but `LoggerModule`/`pinoHttp` is registered nowhere in `apps/api/src`; grep for `redact` hits only the mail-redaction files. `EMAIL_PASSWORD` is protected today only by *never being interpolated into any log line*. Locked decision 7's "joins EMAIL_PASSWORD in whatever redaction the config surface applies" therefore resolves to: (a) the same never-interpolated discipline for `RESEND_API_KEY`, (b) a new `check-invariants` gate pinning where the `resendApiKey` identifier may appear, (c) a unit test asserting `ResendMailTransport` error messages never contain the key (§2.3), and (d) the issue's runtime `grep -ri "re_"` gate.

5. **Live Resend account state (probed by coordinator, read-only):** the key is VALID and FULL-ACCESS (it can list `/api-keys`) — recommend rotating to a **sending-only** key before it ever reaches a deploy env. `GET /domains` is EMPTY: zero verified sending domains, so `DEFAULT_FROM_EMAIL=no-reply@codestack.dev` would 403 on every send today, and the "one real invite delivered" gate is **unsatisfiable until a domain is verified** (external, DNS-paced, human prerequisite — §13 marks the blocked steps). `codestack.dev` may not even be user-controlled (user is @idssoft.com) — open question §14.5.

6. **Rate-limit numbers must not be guessed.** The one measured header (`ratelimit-policy: 10;w=1`) was on `GET /domains`, which Resend limits separately from `POST /emails`. The plan makes "read the `ratelimit-*` headers off a real `POST /emails` response and set `EMAIL_RATE_MAX` with ≥50% headroom" an explicit runbook step (§2.4), not a constant. The BullMQ limiter is **Redis-global across all worker pods** (correct for a provider cap), and any other Resend API traffic shares the same account budget.

7. **`OrgInvite.organizationId` is NOT NULL** (`org-invite.entity.ts:18-19`) and `InvitesController.requireOrg` (`invites.controller.ts:175-183`) 403s any org-less actor. So if open professors were org-less, `INVITABLE_ROLES[PROFESSOR]=[STUDENT]` would have nowhere to write an invite — an open professor could not invite anyone. Resolved explicitly by the origin model (§4): under the recommended community-tenant model, open professors *have* an organization, so the invite surface works mechanically; whether it is *allowed* is a policy choice (§4.4).

8. Confirmed as stated: the nine `MailTemplate`s and typed params (`mail.types.ts`); `enqueue` never throws / `deliver` always throws (`mail.service.ts`); redaction on finished-failed only (`mail.processor.ts:59-91`, `mail-redaction.ts`); `MAIL_JOB_OPTIONS` (`queue/queue.constants.ts:37-42`); the `EMAIL_HOST` `Joi.when` shape (`env.validation.ts:75-80`); the CASE-form constraint and `idx_user_unassigned` (`1785520000000-RelaxUsersOrgRequired.ts`); zero email-verification code anywhere (grep across both apps: no hits); `register()` = always org-less STUDENT with immediate cookies (`auth.service.ts:50-52`, `auth.controller.ts:37-47`); `PasswordResetService` as the quality bar; `assertSameOrg` throws `no_organization` for an org-less non-superadmin actor (`tenant-scope.util.ts:62-81`); `professor_requests` requires an existing `user_id` and is unreachable by org-less users (TenantContextGuard; `/onboarding/requests` is not `@AllowsUnassigned`).

9. Two DB CHECKs the brief didn't mention that new work trips over:
   - `chk_org_invites_source CHECK ("source" IN ('manual','bulk'))` (`1785530000000-ReshapeOrgInvites.ts:86`) — adding an `application` source needs a migration (§9 M5).
   - `chk_organizations_type CHECK ("type" IN ('university','organization'))` (`1785400000000-AddOrganizations.ts:37`) — adding a `community` type needs a migration (§9 M3).

10. `users.create` 409s "Email already registered" (`users.service.ts:66-68`) — public signup is *already* an enumeration oracle. The reworked register flow (§5.2) closes it; noted so nobody treats the new uniform-200 as a regression.

---

## 1. Architecture summary (the decisions, in one screen)

- **#118 ships first and alone** (Phase 0): `MailTransport` interface, `SmtpMailTransport` (existing behaviour), `ResendMailTransport` (HTTP API via undici), DI factory in `mail.module.ts`, `EMAIL_PROVIDER=smtp|resend` default `smtp`, retryable/terminal error classification, and the rate-limiter dead-knob fix.
- **Origin — DECIDED (O2):** an explicit, immutable provenance column `users.origin ∈ {closed, open}` **plus** a platform-operated **community tenant** ("CodeStack Community", `type='community'`) that open users live in. Runtime UI context (co-branded vs plain) derives from the *current* org, provenance from `origin`. Decision record in §4.
- **Email verification is new infrastructure** mirroring `password_reset_tokens` exactly: `users.email_verified_at` + `email_verification_tokens` (sha-256 at rest, `select:false`, conditional-UPDATE single use, preview-never-throws). Invite acceptance and password reset also mark verified (clicking a mailed link proves mailbox access).
- **Unverified accounts cannot log in** (403 `email_unverified`); the verify link signs them in, mirroring reset-password's "landing signed in is the point". Open question §14.3.
- **Open professor = `professor_applications` (new table, pre-account, superadmin-reviewed) whose approval mints an ordinary org invite** (community org, role PROFESSOR, source `application`) — the entire existing invite machinery (token, TTL, resend, accept-set-password, seat handling) is reused instead of re-implemented.
- The existing in-org `professor_requests` promotion flow, its notifications and `admin-requests-page` are **untouched** — it keeps a real purpose (§15.5).
- **Admin→professor invites: DECIDED, flat flip** (§3); compensating control = per-role seat caps (§16) + invite audit, shipped together.
- **Closed ecosystem is now self-serve**: a public "Join as an organisation" flow creates an `organization_applications` row; superadmin approval creates the org **and its per-role seat quotas** in one transaction, then the admin invite rides the existing org-admin-invite path (§15).
- **Per-role seat counts**: `QuotaResource` gains `MAX_PROFESSORS`/`MAX_STUDENTS`, enforced everywhere a role-bearing seat is created *or converted* — including the `PATCH /users` role-change and `professor_requests` approval bypasses (§16).
- **Toasts are a deliverable**: built on the existing sonner 2 stack (`Toaster` in `main.tsx`, `toastOnce` + reason-code interceptor in `api-client.ts`) — per-flow inventory in §17, with the enumeration-safe copy rules.
- Bounce/complaint webhooks + suppression: **out of scope**, per #118 decision 9.

---

## 2. Phase 0 — #118: the Resend provider seam (shippable alone)

### 2.1 `MailTransport` interface + two implementations

`apps/api/src/modules/mail/mail.transport.ts` (extend; keep the filename — history and the STARTTLS comment live here):

```ts
export interface OutboundMail { from: string; to: string; subject: string; html: string; text: string; }
export interface MailTransport {
  /** Throws on failure — BullMQ owns retry. MailDeliveryError.terminal marks unretryable. */
  send(mail: OutboundMail, meta?: { idempotencyKey?: string }): Promise<void>;
  close(): void | Promise<void>;
}
```

- `SmtpMailTransport` — wraps the existing `createMailTransport(cfg)` nodemailer pool verbatim (construction opens no sockets until first send, so eager DI construction is safe). `send` = `transporter.sendMail`, `close` = `transporter.close()`. **Zero behaviour change on the default path.**
- `ResendMailTransport` — new file `apps/api/src/modules/mail/resend-mail.transport.ts` (name makes the provider/invite-resend distinction visible, per the naming-collision note; do NOT touch `resendPending`/`POST /invites/:id/resend`/`InviteResendCooldownException`).
  - `POST https://api.resend.com/emails` via **undici** (already a dependency — no new package), `Authorization: Bearer <key>`, body `{from, to, subject, html, text}`; `headersTimeout`/`bodyTimeout` ~10s; pass `Idempotency-Key: mail-<jobId>` when meta supplies one — BullMQ replays `job.data` on retry, and an accepted-but-response-lost send must not become a duplicate mail (Resend honours the key for 24h, which covers the ~9m retry window of `MAIL_JOB_OPTIONS`).
  - On 2xx: log `Resend accepted <id> for <to>` (message id only — correlation for later webhook work; never the subject/params).
  - **Error classification (locked decision 4):**
    - `429` → throw retryable (include `retry-after` in the message text, not the key).
    - `5xx` and network/timeout errors → throw retryable.
    - `422` (invalid recipient) and `403` (unverified sending domain) → **terminal**.
    - Unlisted 4xx (`400`, `401` bad key) → terminal too: a request that will never succeed must not burn 5 attempts; a bad key is an ops error surfaced by the error log, and retrying cannot fix it. (The issue locks 422/403; this extends the same logic and is called out so it's a conscious choice.)
  - Error type: `export class MailDeliveryError extends Error { constructor(msg: string, readonly terminal: boolean) {...} }` — message built from status + Resend error `name`/`message` fields, **never** from request headers, so the key cannot leak through an exception (unit-asserted, §11).
  - **No retry loop inside the transport** (locked decision 3) — one throw per call.
- `DisabledMailTransport` — `send()` throws `'mailer disabled'` (unreachable: `deliver()` returns before touching the transport when `enabled=false`), `close()` no-op. Exists so DI never carries `null`.

### 2.2 Terminal handling lives in the processor, not the transport

`deliver()` keeps its contract exactly: throw on failure, return on success (locked decision 3). The transport throws `MailDeliveryError`; **`MailProcessor.process` catches it**:

```ts
try { await this.mail.deliver(job.data); }
catch (err) {
  if (err instanceof MailDeliveryError && err.terminal) {
    this.logger.error(`Terminal delivery failure for ${template} to ${to} (job ${job.id}): ${err.message}`);
    await this.scrub(job);   // the mail NEVER arrived — the "token is already in the
                             // recipient's mailbox" rationale for skipping completed-job
                             // scrubbing does not hold here, so scrub before completing.
    return;                  // complete the job; do not consume the remaining attempts
  }
  throw err;                 // BullMQ retries on the existing backoff
}
```

This is the one deliberate extension beyond the issue text: a terminal failure that *completes* would otherwise park a live accept URL in a completed job for `removeOnComplete: {age:300}` with no mailbox copy in existence — the exact asymmetry PR #133 fixed for failed jobs. `scrub` already exists and never throws (`mail.processor.ts:99-109`). The e2e harness is unaffected: it reads tokens from *successfully completed* jobs only.

`process()` currently has "Intentionally unguarded" as its comment (`mail.processor.ts:55`) — rewrite it to explain the terminal/retryable split.

### 2.3 Provider selection in `mail.module.ts` + config

- `mail.module.ts`: provide token `MAIL_TRANSPORT` via `useFactory(ConfigService)`:
  `!cfg.enabled → DisabledMailTransport` (short-circuit **before** any provider is constructed — a disabled mailer needs no key, locked decision 8); `provider === 'resend' → ResendMailTransport(cfg)`; else `SmtpMailTransport(cfg)`. `MailService` injects the token, drops its lazy `this.transport ??=` (the laziness existed only because there was no DI seam), keeps the `enabled` early-return in `deliver()` (log-text-body-outside-prod behaviour unchanged), and `onModuleDestroy` calls `transport.close()`.
- `config/env.validation.ts`: 
  - `EMAIL_PROVIDER: Joi.string().valid('smtp','resend').default('smtp')`.
  - `RESEND_API_KEY`: required **only when the mailer is on AND the provider is resend**, same single-`Joi.when` discipline as `EMAIL_HOST` (nested when):
    `Joi.when('EMAIL_ENABLED', { is: true, then: Joi.when('EMAIL_PROVIDER', { is: 'resend', then: Joi.string().min(1).required(), otherwise: Joi.string().allow('').default('') }), otherwise: Joi.string().allow('').default('') })`.
  - `EMAIL_HOST`'s requirement becomes conditional on provider too (resend over HTTP needs no host): `EMAIL_ENABLED=true` + `EMAIL_PROVIDER=smtp` → required; otherwise optional.
- `config/configuration.ts` `emailConfig`: add `provider`, `resendApiKey`; **delete `rateMax`/`rateDurationMs`** (they move to the one real reader, §2.4).
- **Key hygiene (locked decision 7, honestly):** there is no redaction layer to join (§0.4). Work items: (i) `resendApiKey` is read in exactly two files (`configuration.ts`, the module factory→transport constructor) — add a `check-invariants` gate `gate "resendApiKey read only by config + transport" 2 grep -rn "resendApiKey" $API ...` in `scripts/check-invariants.sh`; (ii) unit test: transport constructed with key `re_TEST...`, every thrown error's `message` and the mocked logger's calls contain no `re_` substring; (iii) runbook: rotate the current **full-access** key to a **sending-only** key before any deploy env sees it.

### 2.4 Rate limiter — make the knob real (its own work item)

**Constraint:** BullMQ reads `limiter` at Worker construction; unlike `concurrency` it cannot be reassigned in `onApplicationBootstrap` (the processor's own comment says so, `mail.processor.ts:23-26`). Options:

- (a) **Delete the env vars**; the decorator literal is the single honest source of truth. Cost: changing the cap (e.g. Resend raises the account limit on request) requires a code change + deploy; and #118 explicitly wants an ops-settable value. Rejected.
- (b) **Read `process.env` at decorator evaluation** via a tiny exported helper, and make env loading not depend on import-order luck. Today it *happens* to work: `app.module.ts` imports `AppConfigModule` (line 6) before `MailModule` (line 15), and `ConfigModule.forRoot()` — which loads `.env` synchronously — executes during that import. That is luck a lint import-sort would destroy. Fix: `import 'dotenv/config'` (dotenv is already a dependency; `data-source.ts:2` already uses it) as the first import of `main.ts` and `worker.ts`, with a comment saying why it must stay first. Helper in `mail.processor.ts`:
  ```ts
  /** Read at class-decoration time: BullMQ bakes `limiter` into Worker construction,
   *  so ConfigService (DI, post-construction) can never reach it. Joi still validates
   *  the same vars; main.ts/worker.ts preload dotenv so this is not import-order luck. */
  const mailLimiter = () => ({
    max: Number(process.env.EMAIL_RATE_MAX ?? 20),
    duration: Number(process.env.EMAIL_RATE_DURATION_MS ?? 1000),
  });
  @Processor(QUEUE_MAIL, { concurrency: 4, limiter: mailLimiter() })
  ```
  Cost: one config value read outside ConfigService — documented at the read site; `EmailConfig.rateMax/rateDurationMs` are deleted so there is exactly one reader and the config type cannot lie again. Spec fixtures (`mail.service.spec.ts:39-40`, `mail.transport.spec.ts:20-21`) drop the fields.
- (c) Construct the Worker manually in a DI factory (full ConfigService access). Cost: abandons `WorkerHost`/`@OnWorkerEvent` conventions in the one module that most needs to stay boring; most code for the least-idiomatic result. Rejected.

**Recommendation: (b).** Defaults: keep `20/1000ms` as the smtp/mailpit/e2e default (lowering it would slow bulk-invite e2e drains for no local benefit). For Resend, **do not default at all**: Joi makes `EMAIL_RATE_MAX` **required when `EMAIL_ENABLED=true` AND `EMAIL_PROVIDER=resend`** — the operator must set it deliberately (locked decision 5). `.env.sample` comment states: the limiter is Redis-global across ALL worker pods; other Resend API calls share the account budget; and the value must come from the `ratelimit-*` headers of a real `POST /emails` response (runbook step, blocked on domain verification §13), set to ≤ half the observed limit.

### 2.5 Docs

- `.env.sample`: `EMAIL_PROVIDER`, `RESEND_API_KEY` (with "secret — never logged; use a sending-only key"), from-address-must-be-on-a-verified-domain warning (`onboarding@resend.dev` delivers only to the account owner), the SMTP-relay fallback documented as fallback only (`EMAIL_HOST=smtp.resend.com`, 465, `EMAIL_USER=resend`, `EMAIL_PASSWORD=<key>`), and the rate-limit guidance above.
- **From-address stays pure env (DECIDED)**: `DEFAULT_FROM_EMAIL` already flows env→`emailConfig.from`→`deliver()`; no domain is hardcoded in code, tests, or fixtures — tests use obviously-fake addresses. **CONFIRMED with the operator (2026-08-01):** the deploy is on the platform-provided `*.up.railway.app` subdomain. That zone belongs to Railway, and Resend verification requires DNS records in a zone the operator owns — so this host **can never be verified**, and the "one real delivered invite" gate is **blocked indefinitely** rather than pending. Consequences to hold to: `onboarding@resend.dev` (delivers to the account owner's own inbox only) is the sole live send path, and it exercises the transport, not any invite flow; every flow-level assertion runs against mailpit; and P0 must therefore be declared complete-with-one-external-gate-open, never "verified end to end". Nothing in the design depends on which domain eventually wins, and no code change is needed when one arrives — `DEFAULT_FROM_EMAIL` is already the only reader.
- README mail section: local mailpit (default, no credentials, no egress) vs production Resend; the naming-collision note (Resend-the-provider vs resend-an-invite).
- **Batch endpoint: deliberately not used in v1.** Jobs are per-recipient; that is what gives per-mail retry, dedupe via `jobId`, and per-job redaction. The HTTP-API choice keeps `/emails/batch` open for a later bulk optimisation; collapsing N jobs into one batch call would trade away retry granularity. Recorded so the "batch endpoint matters" rationale in the issue isn't read as a v1 requirement.

### 2.6 Phase 0 verification gate (from the issue, annotated)

- `pnpm --filter @codestack/api test` ; `pnpm -r typecheck` ; `pnpm check:invariants` ; `pnpm --filter @codestack/api test:e2e`.
- `EMAIL_PROVIDER=smtp` + mailpit: every existing e2e passes unchanged (the seam is a no-op on the default path — provider defaults to smtp and e2e sets nothing).
- `EMAIL_ENABLED=false`, no `RESEND_API_KEY`: app boots, logs bodies (existing `deliver()` branch).
- Unit: forced 422 completes without consuming 5 attempts AND the job payload is scrubbed; forced 429 rethrows (BullMQ backoff); one test per class (429/5xx throw; 422/403/401 no-throw-terminal).
- `grep -ri "re_"` over captured logs: nothing. Plus the new `resendApiKey` invariant gate.
- **BLOCKED on DNS (external):** "one real invite delivered via Resend on a verified domain" + "read real POST /emails ratelimit headers" — see §13.

Size: ~2-3 dev-days. Independently shippable; nothing later depends on more than the `MailTemplate` registry pattern.

---

## 3. Admin → professor invites — DECIDED: flat flip (no gate, no interposition)

Human's words: "dont refer existing flow that is one way, now we have two way flow ecosystem one and individual." The matrix in `invite-policy.ts:23-28` becomes:

```
SUPERADMIN → [ADMIN, PROFESSOR, STUDENT]   (unchanged — still the only minter of admins)
ADMIN      → [PROFESSOR, STUDENT]          (flipped)
PROFESSOR  → [STUDENT]                     (unchanged)
STUDENT    → []
```

**The old comment must not survive as a lie.** `invite-policy.ts`'s "staff onboarding is a SuperAdmin operation… escape hatch is professor_requests" paragraph is rewritten to record the NEW rationale: in the two-way model an org's admin *owns* its staffing inside the seat envelope the superadmin granted at org approval (§15); the platform's control point moved **up a level** — from "who may mint a professor invite" to "how many professor seats exist at all".

**Compensating controls replacing the old invariant** (argued, per coordinator):
1. **Per-role seat caps (§16) are the primary control** — a compromised admin can staff only up to `MAX_PROFESSORS`, a number the superadmin set at approval and can lower at any time. This is *stronger* than the old rule in the dimension that mattered (bounding manufactured staff) and honest about the one it gives up (superadmin no longer reviews each individual).
2. **Audit**: `invited_by_id` already records the minter (`org-invite.entity.ts:72-73`); add professor-invite rows to the platform org-detail census so the superadmin console shows professor count + who minted pending staff invites. (The earlier "notify superadmins per professor invite" idea is dropped — with admins legitimately staffing at will it would be pure noise; the cap + console visibility replace it.)
3. Unchanged backstops: `user-role.policy` rule 2 (an admin can never mint an admin or superadmin), tenancy bounds (staff cannot escape the org), quota charge at mint, `assertEligible` (no demotion/superadmin capture via invites).

Work items: matrix + comment rewrite, `invite-policy.spec` update, one e2e case (admin mints professor invite; accept lands PROFESSOR), and `invite-staff-dialog.tsx`/`org-invites-page.tsx` unhide the professor role option for admins. Ships **with** §16 (the caps are the compensating control, so they land together — Phase 3 in §13).

---

## 4. The origin model — DECIDED: O2 (community tenant + immutable provenance column)

Chosen by the human after reviewing the trade-off against org-less open users. Decision record:

### 4.1 Requirements it survives

(a) an open student later invited into a university; (b) an open professor (DB-illegal if org-less, Conflict 2); (c) a closed user whose org is deleted/suspended; (d) per-request UI branding decision; (e) `idx_user_unassigned` / `GET /users/unassigned` predicate coupling; (f) Conflict 2's CASE-form property (an org-carrying superadmin stays unrepresentable).

### 4.2 Rejected alternatives (one line each — details no longer carried)

- **O3 — derive from `organization_id IS NULL`:** claiming an invite would silently erase open-ness; NULL is a transitional holding state, not an ecosystem; org-less professors are DB-forbidden and guard-confined. Rejected.
- **O1 — org-less open users + constraint rewrite:** structurally a second, tenant-less product (every org-scoped feature re-decided, `@AllowsUnassigned` blown open, `chk_users_org_required` surgery). Rejected; remains the escape path only (§13 deferred list).
- **O2 — a platform-operated community tenant + immutable provenance column (DECIDED).**
  - One `organizations` row: `name='CodeStack Community'`, `slug='codestack-community'`, **`type='community'`** (new value, CHECK widened, §9 M3), created by migration so every environment (including each e2e database, which runs all real migrations) has it deterministically. Resolved at boot into a `CommunityOrgService` (id cached; `OrganizationCache` pattern) — never hardcode the uuid.
  - `users.origin varchar(20) NOT NULL DEFAULT 'closed' CHECK IN ('closed','open')` — **provenance, written once at account creation, never updated**. Backfill: `organization_id IS NULL AND role='student'` → `'open'` (self-registrants), else `'closed'`.
  - **Runtime ecosystem = current org**: community org → open UI (plain CodeStack); real org → co-branded UI. `origin` answers "how was this account born" (audit, analytics, support); the org answers "what does this request render as". An open student who accepts a university invite keeps `origin='open'` but *renders* closed — that is the correct answer to (a): they joined the ecosystem, the history of how they arrived is not erased.
  - (b): open professors live in the community org → `chk_users_org_required` is satisfied **unchanged**; no constraint migration, no `@AllowsUnassigned` expansion, Conflict 2 evaporates. (e): untouched — community members are not unassigned, and new open signups stop feeding the unassigned pool (the pool remains for pre-existing org-less students until claimed; `platform-unassigned-page` keeps working).
  - (c): org deletion/suspension semantics unchanged (suspended → `/suspended` page; this plan adds nothing).
  - (f): CASE form untouched.

### 4.3 O2 consequences that must be engineered, not discovered

1. **Community members must be claimable by real orgs.** `invites.service.create` computes `kind=CLAIM` only for `organizationId === null` (line 82-86); `claim()` rejects `organizationId !== null` (line 306-311); `acceptAsExistingUser` answers `email_unavailable` for "some other tenant" (line 386). Introduce `isOpenMember(user) = user.organizationId === communityOrgId` and treat it exactly like org-less in all three places (kind computation; claim allowed from community → target org, charging the target org's seat inside the same transaction — community org has no `org_quotas` row = unlimited, so nothing to release; `restampDenormalisedOrg` runs as it does for null→org moves, re-attributing gamification/submission rows — same accepted behaviour as today's claim, stated here so it's a decision not a surprise). The cross-tenant opacity rationale survives: only the community org is special-cased, real-org↔real-org stays `email_unavailable`.
2. **Community staff surfaces must be closed off.** In a real org, PROFESSOR+ legitimately lists org users/invites (`GET /users`, `/invites`, `/users/unassigned`, admin pages are role-gated, not module-gated). In a tenant of mutually-anonymous strangers that is a directory leak: any open professor could enumerate every open user. Add `assertOrgAllowsStaffDirectory(org)` (new `common/tenancy/community-policy.ts`): throws 403 `community_restricted` when the actor's org is `type='community'` and the actor is not SUPERADMIN — applied in `users.controller` list/unassigned/assign, `invites.controller` list, and the admin web routes hide behind `organization.type !== 'community'`. Whether open professors may *mint student invites* into the community org is a policy choice — recommend **no in v1** (`assertMayInvite` additionally refuses when the target org is the community org unless actor is SUPERADMIN); their teaching surface is Phase-deferred (§14.7). This answers coordinator fact 4 explicitly: **an open professor's student surface in v1 is none** — they get the practice/consumption surface (problems, playground, topics per community-org module grants), and org-style teaching happens when a real org invites them.
3. **Module/feature shape of the community org** is data, not code: the superadmin sets the community org's module grants via the existing #64 machinery (e.g. classrooms/grading off, problems/playground/topics on). Seed nothing beyond defaults; document the recommended grant profile in the runbook.
4. **JWT: no new claims.** `JwtPayload` keeps `{sub, email, role, organizationId, type}`. Guards re-stamp `request.user` from the fresh DB row (per `invites.controller.ts:123-125` comment), so origin/verified checks read the row; already-issued tokens stay valid; `refresh()` untouched. The web learns origin/branding from `GET /auth/verify` (§10).

### 4.4 What `SessionContextDto` gains

`origin: 'closed'|'open'`, `emailVerified: boolean`, and `organization.branding` + `organization.type` (via `OrganizationSummaryDto`). Assembled in `SessionContextService.build` — the seam that exists precisely so the auth controller is never edited (#54).

---

## 5. Personas, flows, and state machines

### 5.1 State machine table (role × origin)

Legend: mails in [brackets]; ⚡ = new endpoint/logic.

| Persona | States & transitions | May do in-app | Mail on transition |
|---|---|---|---|
| **ORG (closed, ⚡§15)** | public application → `pending` → superadmin approves (org+quotas+admin invite, one transaction) / rejects | — (pre-tenant) | [org-application-received] + superadmins [org-application-alert] → [org-admin-invite] (+[org-application-approved] if contact ≠ admin) / [org-application-rejected] |
| **ADMIN (closed)** | superadmin mints invite (typically at org approval ⚡) → `invited` → accept+set-password → `active` (verified implicitly ⚡) | full org console | [org-admin-invite] → [welcome] |
| **PROFESSOR (closed)** | invite (superadmin or admin — §3 DECIDED) → accept → `active`; or existing in-org student promoted via `professor_requests`/`PATCH /users` (both cap-checked §16) | teaching surface | [professor-invite] → [welcome] |
| **STUDENT (closed)** | invite (admin/professor/superadmin, manual or bulk) → accept → `active`; or existing open/unassigned user → CLAIM → org member | student surface | [student-invite] → [welcome]; claim → [org-assigned] + in-app ORGANIZATION_ASSIGNED (both, because the user may not be logged in when moved — mail reaches them, the notification greets them on next login) |
| **STUDENT (open)** ⚡ | register → `unverified` (no session) → verify link → `active` in community org (+signed in, onboarding page) | before verify: nothing (cannot log in); after: community modules | [verify-email] → [welcome-open] |
| **PROFESSOR (open)** ⚡ | apply (no account) → `application:pending` → superadmin approves → invite minted (community org, PROFESSOR, source=application) → accept+set-password → `active` (verified) | before accept: nothing; after: community consumption surface (no staff directory, no invites v1) | [professor-application-received] + superadmins [professor-application-alert] + in-app → approve: [professor-application-approved (carries acceptUrl)] / reject: [professor-application-rejected] → accept: [welcome-open] |
| **SUPERADMIN** | seed-only, unchanged | + `/platform/professor-applications` review queue ⚡ | receives [professor-application-alert] |

### 5.2 Unhappy paths (each is an explicit test)

- **Expired invite:** existing `invite_expired` + staff resend rotates token. Application-sourced invites: superadmin resends from the platform invites surface (exists). Unchanged.
- **Expired verification token:** `POST /auth/resend-verification` (uniform 200; silently no-ops for unknown/verified/disabled) mints a fresh token invalidating prior live ones (same sweep pattern as `requestReset`).
- **Rejected professor:** mail with optional reason; may re-apply (partial-unique index is on `status='pending'` only); superadmin sees full history per email. No cooldown in v1 (open question §14.8).
- **Re-signup with an existing email (the takeover/enumeration nexus):** `POST /auth/register` answers a **uniform 200 "check your inbox"** for every branch. Address free → create + [verify-email]. Address held by an *unverified open* account → rotate + re-send verification, **never** touching the stored password/name (otherwise: attacker pre-registers victim's email; victim "re-signs up", attacker's password survives victim's verification — the classic pre-registration takeover; conversely an attacker re-signing-up must not overwrite the victim's chosen password). Address held by any *verified/closed* account → send [account-exists] (links to login + forgot-password; carries no credential). Latency shaping: argon2 hash of the submitted password is computed in every branch before deciding, so timing doesn't discriminate. The old 409 remains only on the authenticated staff `POST /users` path where enumeration is not a concern (actor already shares the tenant).
- **Open user later invited to an org:** invite kind=CLAIM (community treated as claimable, §4.3.1); accept-while-anonymous answers `account_exists {claimRequired:true}` → web prompts sign-in → `POST /invites/claim`. Seat charged to target org in the claim transaction.
- **Invite to an email that already has an account:** unchanged matrix (`acceptAsExistingUser`) — same-org idempotent consume; community/org-less → claimRequired; other real org → opaque `email_unavailable`.
- **Unverified user attempts login:** `validateCredentials` gains one check after password verification: `if (!user.emailVerifiedAt && user.origin === 'open') throw ForbiddenException {reason:'email_unverified'}` — *after* password check so an attacker without the password learns nothing new; closed-origin accounts are exempt (they were minted verified). Web shows "verify your email" + resend CTA.
- **Password reset on an unverified account:** `requestReset` already skips password-less accounts; an unverified account *with* a password gets the mail, and `resetPassword` additionally stamps `email_verified_at = now()` (mailbox access proven) — otherwise a verified-reset user still couldn't log in, which would be baffling.
- **Application approved but applicant's invite expires / applicant already registered as a student meanwhile:** approval mints the invite via `invites.create` with the SUPERADMIN actor → existing machinery answers (`invite_already_pending`, CLAIM-kind for a now-existing community student — which correctly *promotes* them to professor on claim per invite.role; `assertEligible` blocks demotions only).

### 5.3 What "forgot password" still needs (precisely — the flow otherwise EXISTS)

`PasswordResetService` + web pages (`forgot-password-page.tsx`, `reset-password-page.tsx`) are complete and remain the quality bar. The only deltas: (i) `resetPassword` stamps `email_verified_at` (§5.2); (ii) reset mail copy stays **neutral CodeStack** (no co-branding: the requester's org is knowable but a reset mail is an account-security artifact, and keeping it visually invariant makes phishing lookalikes easier to spot — decision recorded); (iii) nothing else.

---

## 6. Mail template inventory (complete)

### 6.1 Existing nine — all reused, none renamed

`org-admin-invite`, `professor-invite`, `student-invite`, `invite-reminder`, `welcome`, `access-revoked`, `access-restored`, `org-assigned`, `password-reset`. The four org-flavoured ones (`*-invite`, `invite-reminder`) plus `welcome`/`org-assigned` gain **optional** co-branding (§6.3) — additive param, no call-site breaks.

### 6.2 New templates (exact keys, params, credential status)

| `MailTemplate` key | Params interface | Credential |
|---|---|---|
| `VERIFY_EMAIL = 'verify-email'` | `VerifyEmailParams { firstName?, lastName?, verifyUrl, expiresInHours }` | **YES — `verifyUrl`** |
| `WELCOME_OPEN = 'welcome-open'` | `WelcomeOpenParams { firstName?, lastName?, loginUrl }` (no orgName — an open user's mail names only CodeStack) | no |
| `ACCOUNT_EXISTS = 'account-exists'` | `AccountExistsParams { firstName?, lastName?, loginUrl, forgotPasswordUrl }` (page links, not tokens) | no |
| `PROFESSOR_APPLICATION_RECEIVED = 'professor-application-received'` | `{ firstName?, lastName? }` | no |
| `PROFESSOR_APPLICATION_APPROVED = 'professor-application-approved'` | `InviteParams` (it *is* an invite mail — orgName renders as "CodeStack", copy says "approved — set your password"; sent via `sendInviteMail`'s existing template-override parameter, `invites.service.ts:517`) | **YES — `acceptUrl`** (already in `CREDENTIAL_PARAMS`) |
| `PROFESSOR_APPLICATION_REJECTED = 'professor-application-rejected'` | `{ firstName?, lastName?, reason?: string \| null }` (reason is admin-authored text → `oneLine`+`escapeHtml`) | no |
| `PROFESSOR_APPLICATION_ALERT = 'professor-application-alert'` (to superadmins) | `{ applicantName, applicantEmail, message?, reviewUrl }` (`reviewUrl` = console page, no token) | no |
| `ORG_APPLICATION_RECEIVED = 'org-application-received'` ⚡§15 | `{ firstName?, lastName?, orgName }` | no |
| `ORG_APPLICATION_APPROVED = 'org-application-approved'` ⚡§15 | `{ firstName?, lastName?, orgName }` — sent to the contact **only when the admin invite goes to a different address**; when contact = admin the org-admin-invite mail is the approval | no |
| `ORG_APPLICATION_REJECTED = 'org-application-rejected'` ⚡§15 | `{ firstName?, lastName?, orgName, reason?: string \| null }` (`reason` admin-authored → `oneLine`+`escapeHtml`) | no |
| `ORG_APPLICATION_ALERT = 'org-application-alert'` (to superadmins) ⚡§15 | `{ orgName, contactName, contactEmail, reviewUrl }` | no |

Mechanics per template: enum key + params interface in `mail.types.ts`, entry in `MailTemplateParams` and the `TEMPLATES` registry (`templates/index.ts`) — the mapped type makes omission a compile error. New renderer files: `templates/verification.templates.ts`, `templates/application.templates.ts`.

**Redaction (locked decision 10 — the real work item):** `mail-redaction.ts` `CREDENTIAL_PARAMS` gains `'verifyUrl'`. `mail-redaction.spec.ts` gains a **registry-driven** test: iterate `MailTemplate`, build a representative message per template, and assert `hasCredential` is true for exactly the credential set {all four invite templates, `password-reset`, `verify-email`, `professor-application-approved`} — so the *next* new template with a token URL fails a test instead of shipping a leak.

### 6.3 Co-branding in mail

- Storage: `organization.settings.branding = { logoUrl?: string, displayName?: string }` (the `settings` JSONB comment already reserves "Per-org branding"). Written via the existing org update surface (`PATCH /platform/organizations/:id` + a new org-admin settings field); **validated at write time**: https-only absolute URL, length-capped — never validated at render (render must not throw).
- Params: `InviteParams`/`WelcomeParams`/`OrgAssignedParams` gain `branding?: { logoUrl?: string | null }`. `layout.ts` `wrapHtml` gains an optional partner block: header renders `CodeStack × {orgName}` text lockup and, when `logoUrl` present, `<img src="..." height="28" alt="">` with the URL attribute-escaped. Plain-text bodies render `CodeStack × {orgName}` textually. Absent branding = today's output byte-for-byte (snapshot-tested).
- Open users' mail: no org → no partner block → plain CodeStack (the "what does an OPEN user's mail look like" answer). The community org never gets branding.
- `password-reset` and `verify-email` stay neutral deliberately (§5.3.ii).
- Reaching the template: the enqueuing services already load the org row (`invites.service.create` line 68, `resend` line 195) — pass `org.settings.branding` through; no new query, no cache work (`OrganizationCache` is status-only and stays that way).

---

## 7. Endpoints (new/changed) — method, path, guard, DTO, codes, throttle

Existing global stack applies: `AppThrottlerGuard` (day/hour/minute defaults), JwtAuthGuard+RolesGuard+TenantContextGuard order, `@Public` bypass. "Uniform" = enumeration-safe identical response on every branch.

| # | Endpoint | Guard/gate | Request → Response | Codes | Throttle | Notes |
|---|---|---|---|---|---|---|
| 1 | `POST /auth/register` (CHANGED) | `@Public` | `RegisterDto` → `{message}` **uniform**, **no cookies, no user body** | 200 always | keep 5/min | §5.2; breaking change for `register-form.tsx` |
| 2 | `POST /auth/verify-email` ⚡ | `@Public` | `{token, }` → `{user, message}` + cookies (signs in, mirrors reset-password) | 200; 403 `verify_token_invalid/used/expired` (holder already has the link — informative like `InvalidResetTokenException`) | 5/min, 50/day | conditional-UPDATE single-use |
| 3 | `GET /auth/verify-email/:token/preview` ⚡ | `@Public` | → `{status, maskedEmail?}` | **200 always, never throws** (raw token in path → AllExceptionsFilter `path` → log) | 20/min, 100/h | clone of reset preview |
| 4 | `POST /auth/resend-verification` ⚡ | `@Public` | `{email}` → `{message}` **uniform** | 200 always | 3/min, 10/h (mirror forgot-password) | keyed on email → enumeration-safe |
| 5 | `POST /auth/professor-applications` ⚡ | `@Public` | `{email, firstName, lastName, message?}` → `{message}` **uniform** (pending duplicate, existing user, fresh — identical) | 202 | 3/min/IP, 10/day | keyed on email → enumeration-safe; mails applicant + superadmins |
| 6 | `GET /platform/professor-applications?status=&page=` ⚡ | `@Platform()` | → paginated `ProfessorApplicationDto` | 200 | default | platform module (§ its controller conventions) |
| 7 | `POST /platform/professor-applications/:id/approve` ⚡ | `@Platform()` | → dto | 200; 404; 409 already-reviewed | default | transaction: status flip (conditional UPDATE on `status='pending'`) + mint invite via `invites.create(..., communityOrgId, OrgInviteSource.APPLICATION)` with template override |
| 8 | `POST /platform/professor-applications/:id/reject` ⚡ | `@Platform()` | `{reason?}` → dto | 200; 404; 409 | default | mails rejection |
| 9 | `POST /invites/accept` (CHANGED) | `@Public` | unchanged shape | unchanged | unchanged | also stamps `email_verified_at` on the created/claiming user (link click = mailbox proof) |
| 10 | `POST /auth/reset-password` (CHANGED) | `@Public` | unchanged | unchanged | unchanged | also stamps `email_verified_at` (§5.2) |
| 11 | `POST /auth/login` (CHANGED) | `@Public` | unchanged; new failure `403 {reason:'email_unverified'}` after password check | +403 | unchanged | closed-origin exempt |
| 12 | `GET /invites/:token/preview` (CHANGED) | `@Public` | response gains `branding {logoUrl?}` + `organizationType` | unchanged | unchanged | feeds the co-branded accept page; never-throws preserved |
| 13 | `GET /auth/verify` (CHANGED) | authed, `@AllowsUnassigned` (existing site — count stays 5) | `SessionContextDto` gains `origin`, `emailVerified`, `organization.branding/type` | unchanged | — | via `SessionContextService` seam |
| 14 | `PATCH /platform/organizations/:id` (CHANGED) | `@Platform()` | accepts `settings.branding` (validated DTO) | unchanged | — | plus org-admin variant if desired (defer; superadmin-set in v1) |
| 15 | `POST /organization-applications` ⚡§15 | `@Public` | `OrgApplicationDto {orgName, orgType, contactEmail, contactFirstName, contactLastName, website?, message?}` → `{message}` **uniform** (fresh, duplicate-pending, contact-has-account — identical) | 202 always | 3/min/IP, 10/day/IP | public write — DTO length caps; org name is NOT an oracle (no dupe rejection) |
| 16 | `GET /platform/organization-applications?status=&page=` ⚡§15 | `@Platform()` | → paginated dto | 200 | default | review queue |
| 17 | `POST /platform/organization-applications/:id/approve` ⚡§15 | `@Platform()` | `{slug, adminEmail, maxProfessors?, maxStudents?, maxUsers?}` → dto | 200; 404; 409 already-reviewed / slug taken | default | one transaction: org + quotas + admin invite (§15.4); mail after commit |
| 18 | `POST /platform/organization-applications/:id/reject` ⚡§15 | `@Platform()` | `{reason?}` → dto | 200; 404; 409 | default | mails rejection |
| 19 | `PATCH /platform/organizations/:id/quotas` (EXISTS — extend) | `@Platform()` | accepts the two new resources (§16) | unchanged | — | `org-quota-form.tsx` already renders per-resource rows |

Enumeration-safety applies to #1, #4, #5, #15 (email-/name-keyed, public). #2/#3 are token-keyed (256-bit — not enumerable). #7/#8/#16-18 are superadmin-only.

---

## 8. Token strategy for verification

- **Reuse `invites/invite-token.util`** (`mintInviteToken`/`hashToken`) — it is already the shared primitive for password reset, and its sha-256-not-argon2 rationale (256-bit uniform input) applies identically. No new crypto.
- **Separate table `email_verification_tokens`**, not rows in `password_reset_tokens` and not `org_invites`: different TTL, different consume side-effect (stamp a column vs set a password vs create a member), and `password-reset-token.entity.ts`'s own doc-comment establishes the house pattern of *mirrored parallel tables* ("deliberately mirrors org_invites' token columns"). A discriminator column on a shared table would buy one table at the price of conditional semantics in every query.
- Shape: `user_id uuid FK users ON DELETE CASCADE`, `token_hash varchar(64) select:false` + hex CHECK, `expires_at timestamptz NOT NULL`, `used_at timestamptz NULL`, timestamps. Index on `user_id`.
- **TTL 24 hours** — between reset's 60min (acting now) and invite's 14d (acting eventually): a signup verifies "soon" but not necessarily this minute.
- **Single-use**: conditional `UPDATE ... SET used_at=now() WHERE id=:id AND used_at IS NULL`, `affected===1` — same control as reset/invite consume, same double-submit race answer.
- **Re-request** invalidates every prior live token first (same sweep as `requestReset`), then mints — one live link at a time.
- **Preview never throws**, returns masked email only (clone of `PasswordResetService.preview`, including the belt-and-braces deleted-user branch).
- New service `apps/api/src/modules/auth/email-verification.service.ts` + entity `entities/email-verification-token.entity.ts` + spec — deliberately shaped file-for-file on `password-reset.service.ts` so the two cannot drift.

---

## 9. Migrations (ordered; timestamps follow the 1785xxxxxxxxx sequence; `check:migrations` guards ordering)

| # | Name | up() | down() | Online-safe? |
|---|---|---|---|---|
| M1 | `AddEmailVerification` | `ALTER TABLE users ADD COLUMN email_verified_at timestamptz NULL` (nullable add = metadata-only); backfill `UPDATE users SET email_verified_at = created_at` (grandfather every existing account — they predate verification and staff/invite-created accounts are mailbox-proven or staff-vouched); create `email_verification_tokens` (+hex CHECK `chk_email_verif_token_hash`, FK CASCADE, `idx_email_verif_user`) | drop table; drop column (both lossless-destructive, stated) | yes (single UPDATE pass; batch by id range if users grows large — note in file) |
| M2 | `AddUserOrigin` | `ADD COLUMN origin varchar(20) NOT NULL DEFAULT 'closed'` + `chk_users_origin CHECK (origin IN ('closed','open'))`; backfill `UPDATE users SET origin='open' WHERE organization_id IS NULL AND role='student'` | drop CHECK, drop column | yes (PG≥11 default-add is metadata-only) |
| M3 | `AddCommunityOrg` | widen `chk_organizations_type` to `('university','organization','community')`; `INSERT` the community row (fixed slug `codestack-community`, `type='community'`, `settings '{}'`, `created_by_id NULL`) idempotently (`ON CONFLICT (slug) DO NOTHING` via the unique slug index) | **fails loud** (RAISE) if any `users`/`org_invites` row references the community org — deleting a tenant out from under members would be the same misattribution `RelaxUsersOrgRequired.down()` refuses; escape hatch documented in-file. Otherwise delete row + restore CHECK | yes |
| M4 | `AddProfessorApplications` | table: id/base cols, `email varchar(254)`, `first_name/last_name varchar(150)`, `message text default ''`, `status varchar(20) default 'pending'` + CHECK `('pending','approved','rejected')`, `reviewed_by_id uuid NULL FK users SET NULL`, `reviewed_at`, `decision_reason text default ''`, `invite_id uuid NULL FK org_invites SET NULL`; **partial unique** `uq_prof_app_pending_email ON (lower(email)) WHERE status='pending'`; `idx_prof_app_status` | drop table | yes |
| M5 | `WidenOrgInviteSource` | `chk_org_invites_source` → `('manual','bulk','application')` (drop+re-add, brief `ACCESS EXCLUSIVE` but validation scan is fast at current scale; `NOT VALID`+`VALIDATE` variant noted for large tables) | fails loud if any `source='application'` row exists (flipping them to 'manual' would lie about provenance), else restore | yes-ish (noted) |
| M6 ⚡ | `WidenOrgQuotaResources` (§16) | widen the `org_quotas.resource` CHECK to add `('max_professors','max_students')` — the enum's own comment mandates exactly this ("widening that CHECK in a migration, but never an ALTER TYPE") | fails loud if rows with the new resources exist, else restore CHECK | yes-ish (same note as M5) |
| M7 ⚡ | `AddOrganizationApplications` (§15) | table: base cols, `org_name varchar(200)`, `org_type varchar(20)` CHECK `('university','organization')`, `contact_email varchar(254)`, `contact_first_name/last_name varchar(150)`, `website varchar(255) NULL`, `message text default ''`, `status varchar(20) default 'pending'` CHECK `('pending','approved','rejected','withdrawn')`, `reviewed_by_id uuid NULL FK users SET NULL`, `reviewed_at`, `decision_reason text default ''`, `organization_id uuid NULL FK organizations SET NULL` (written at approval — **no FK is NOT NULL: the row precedes both tenant and user**); partial unique `uq_org_app_pending_email ON (lower(contact_email)) WHERE status='pending'`; `idx_org_app_status` | drop table | yes |

**No change to `chk_users_org_required` anywhere in this plan** — under the decided O2 model the constraint, its CASE form, and `idx_user_unassigned` are untouched.

---

## 10. Web work (existing file vs new file)

**How the client learns origin/branding:** exclusively from `GET /auth/verify` → `auth-context.tsx` (`SESSION_QUERY_KEY`, staleTime 5min — no new fetch, no new cache); pre-auth co-branding (invite accept) from the extended invite preview response. No localStorage, no separate branding endpoint.

Changed:
- `features/auth/components/register-form.tsx` — role choice ("Join as a student" / "Apply as a professor") toggling between the student form and the application form; student submit now shows the inline "check your inbox" state (no auto-login).
- `features/auth/context/auth-context.tsx` — `register` no longer invalidates into a session; add `verifyEmail` (cookie-minting → invalidate `SESSION_QUERY_KEY`, joining the documented "third cookie-minting call" pattern at line 79) and `applyAsProfessor` mutations; expose `origin`, `emailVerified`, `organization.branding`.
- `features/auth/api/auth.api.ts` — new calls (register return shape change, verify-email, resend-verification, professor-applications).
- `components/layout/app-shell.tsx`, `navbar.tsx`, `sidebar.tsx` — co-branded lockup ("CodeStack × {org}" + logo) when `organization && organization.type !== 'community'`; plain CodeStack otherwise; sidebar gains the platform "Professor applications" link (superadmin) and hides org-admin links for community members.
- `components/layout/protected-route.tsx` — unchanged logic (unverified users never hold a session under the recommended login-block, so no new routing state).
- `features/invites/pages/invite-accept-page.tsx` — renders org logo/name from the extended preview (co-branded accept experience).
- `features/auth/pages/auth-page.tsx` / `login-form.tsx` — handle `403 email_unverified` with a resend CTA. Auth pages themselves stay CodeStack-branded (no org context exists pre-login; a `/login?org=slug` co-branded door is explicitly deferred).
- `App.tsx` — new routes: `/verify-email/:token`, `/application-sent`, `/onboarding` (post-verify profile/timezone step, inside ProtectedRoute but outside AppShell like `/pending`), `platform/professor-applications` under `RequireSuperAdmin`.

New:
- `features/auth/pages/verify-email-page.tsx` (preview → status states → verify → onboarding redirect).
- `features/onboarding/pages/open-onboarding-page.tsx` (light: name/timezone confirm → dashboard).
- `features/auth/pages/professor-apply-page.tsx` or in-form panel + `application-sent` confirmation state.
- `features/platform/pages/platform-professor-applications-page.tsx` (queue: pending list, approve/reject with reason, history).
- ⚡§15: `features/marketing/pages/landing-page.tsx` gains the "Join as an organisation" CTA; new `features/onboarding/pages/org-apply-page.tsx` (public, multi-field form → uniform "request sent" state); new `features/platform/pages/platform-org-applications-page.tsx` (review queue; approve dialog collects slug + admin email (prefilled with contact, editable) + seat counts — reusing `org-quota-form.tsx`'s per-resource rows).
- ⚡§16: `features/platform/components/org-quota-form.tsx` renders the two new resources (it is per-resource-driven; verify it maps unknown keys gracefully); `platform-org-detail-page.tsx` census shows per-role usage.
- ⚡§17: `lib/toast-reasons.ts` (shared reason→copy map) + the per-flow toast wiring — inventory and rules in §17.

Untouched: `pending-assignment-page`, `suspended-page`, `admin-requests-page` (in-org promotion flow lives on), `forgot/reset-password` pages (already exist; reset page needs zero change).

---

## 11. Test plan

**Unit (`pnpm --filter @codestack/api test`):**
- `resend-mail.transport.spec.ts` — one test per class: 429 → throws non-terminal; 500/network-timeout → throws non-terminal; 422 → terminal; 403 → terminal; 401/400 → terminal; success logs message id; **no thrown message or log call contains `re_`** (decision 7 assertion); idempotency key forwarded.
- `mail.module` factory spec — `enabled=false` → `DisabledMailTransport` and the Resend constructor is *never invoked* (spy) even with `provider=resend` and no key; provider selection matrix.
- `mail.processor.spec` — terminal error: completes (no rethrow), scrubs payload, logs error, `attemptsMade` untouched; non-terminal: rethrows.
- `mail-redaction.spec.ts` — registry-driven credential census (§6.2).
- `email-verification.service.spec.ts` — mirror of `password-reset.service.spec` case-for-case (silent branches, sweep-then-mint, single-use race via `affected`, preview never throws, masked email).
- `invite-policy.spec` — flipped matrix (§3, ships in P3) + community-org invite refusal.
- Per-role quota specs + org-application specs — detailed in §15.7 / §16.5.
- `professor-applications.service.spec` — uniform-202 branches, approve mints invite exactly once (conditional status UPDATE race), reject reason escaping.
- `templates.spec.ts` — snapshots: branding present/absent byte-compatibility; new templates escape user text (`orgName`/`reason`/names) and one-line subjects.
- Limiter helper spec — env parsing/defaults.

**e2e (`pnpm --filter @codestack/api test:e2e`)** — note PR #134: ONE shared Postgres + ONE Redis for the whole run; `createTestApp` gives each suite its own database and each Jest worker its own Redis DB index, and `flushRedis` runs per suite. Consequences honoured: (i) new suites read mail via the same "latest completed job in *this worker's* Redis DB" helper — never assume queue emptiness beyond `flushRedis`; (ii) tokens must be read from completed jobs promptly (`removeOnComplete {age:300}` — fine, reads are immediate); (iii) the community org arrives via migrations, so every suite database has it with no fixture work; (iv) don't `--runInBand`-couple suites.
- `open-student.e2e-spec.ts` — register(uniform 200, no cookies) → verify-token from completed mail job → preview → verify(signed in, `emailVerified`, community org, origin open) → welcome-open queued → login works; re-register duplicate → uniform 200 + account-exists mail + password unchanged; login-before-verify → 403 `email_unverified`; resend-verification uniform; reset-password stamps verified.
- `professor-application.e2e-spec.ts` — apply(uniform) → superadmin list/approve → application-approved mail's acceptUrl → accept+password → professor in community org, verified; reject path; duplicate-pending uniform; community professor cannot list users (403 `community_restricted`) and cannot mint invites.
- `invites.e2e-spec.ts` additions — community member invited by a real org → CLAIM kind; claim moves org + charges seat + restamps.
- Existing suites unchanged under `EMAIL_PROVIDER` default (the seam no-op gate).
- `check:invariants` — new `resendApiKey` gate; `@AllowsUnassigned` stays 5 (nothing here adds a site: new public endpoints are `@Public`, unverified users hold no session).

---

## 12. Security review

- **Token exposure:** all three token families sha-256 at rest, `select:false`, raw value only in mail/URL/request-body; previews never throw (log-path leak); `verifyUrl` joins `CREDENTIAL_PARAMS`; terminal-failure scrub closes the never-delivered-credential window (§2.2); e2e reads tokens from completed jobs inside the accepted 5-minute bound (pre-existing, documented at `mail.processor.ts:70-75`).
- **Log redaction:** processor logs stay to/template/job.id; Resend transport logs message id only; `RESEND_API_KEY` — no redaction layer exists, so: two-file identifier gate in `check-invariants`, key-free error construction (unit-asserted), runtime `grep -ri "re_"` gate, sending-only key + rotation of the current full-access key (it could read/manage the account today).
- **Enumeration:** register/resend-verification/professor-apply are uniform-response + latency-shaped (argon2 in every register branch); forgot-password already is; cross-tenant `email_unavailable` opacity preserved, with the community org as the single deliberate exception (it is not a tenant anyone owns).
- **Privilege escalation:** SUPERADMIN remains seed-only and never-assignable (`user-role.policy` rule 1 untouched); application approval mints PROFESSOR only, via `INVITABLE_ROLES[SUPERADMIN]` and only into the community org; Conflict-1 flip (if chosen) is tenant-bounded + audited; `assertEligible` still blocks demotion/superadmin capture via invites; application approve/reject uses conditional status UPDATE (no double-approve minting two invites).
- **Tenant isolation for co-branding:** branding is read from the actor's own org (session) or from the invite's org via a token the holder already possesses (preview) — no cross-org read path; community staff-directory lockout (§4.3.2) prevents the open tenant becoming an enumeration pool; `scopeToOrg`/`assertSameOrg` untouched.
- **Seat/quota accounting:** every new user-creating path charges inside the creating transaction: open register → community org (no `org_quotas` row = unlimited by design, decision recorded); application accept → community org via the ordinary invite accept (consume-then-charge order preserved); claim from community → target org +1. No quota-free role path is introduced (the RegisterDto comment's invariant holds).
- **Verification bypass audit:** the only writers of `email_verified_at` are: verify-email consume, invite accept/claim, password-reset consume, and the M1 backfill — each is mailbox-proof or staff-vouched.

---

## 13. Phasing (each independently shippable, with gate and size)

**Process (human's decision): nothing ships — P0 included — until this plan is approved end to end.** This table plus §14 are the review surface: approve the phases, answer the open questions, and implementation starts at P0.

| Phase | Contents | Gate | Size |
|---|---|---|---|
| **P0 — #118 Resend seam** (current open issue; first and alone) | §2 entire: interface, 2 transports + disabled, module factory, EMAIL_PROVIDER/RESEND_API_KEY Joi, **rate-limiter dead-knob fix**, stale-comment fix, terminal/retryable handling + scrub, docs, key-hygiene gates | §2.6; **externally blocked items** (human/DNS): verify a self-owned sending domain (Railway subdomain cannot be, §2.5), rotate to sending-only key, read real `POST /emails` ratelimit headers → set `EMAIL_RATE_MAX` | M (2-3d) |
| **P1 — Email verification foundation** | M1; entity+service+spec; endpoints 2/3/4; login gate (DECIDED: no login until verified); accept/claim/reset stamp verified; `verify-email` template + redaction census | unit+e2e green; existing users unaffected (backfill); `@AllowsUnassigned` still 5 | M (2-3d) |
| **P2 — Origin model + open student** | M2+M3; community org service + policy lockouts; register rework (uniform, community stamp, `welcome-open`, `account-exists`); claim-from-community; session fields; web: role-choice, check-inbox, verify page, onboarding page, shell branding *plumbing* | `open-student.e2e-spec`; invites e2e additions; tenancy-isolation suite green | L (4-6d) |
| **P3 — Per-role seat caps + invite-matrix flip** (§16 + §3, together: the caps are the flip's compensating control) | M6; `QuotaResource` + per-role `currentUsage` + shared census predicate helper; enforcement at all seven points incl. `PATCH /users` and `professor_requests` approval; matrix flip + comment rewrite; console census + quota form rows | quota unit specs (predicate parity test vs census); e2e: professor cap blocks 8th invite, role-change, and promotion; admin mints professor invite | M-L (3-4d) |
| **P4 — Organisation self-signup** (§15) | M7; applications service/controllers (endpoints 15-18); approval transaction (org+quotas+admin-invite); 4 templates + superadmin alert (mail + in-app); landing CTA + org-apply page + platform review queue | `org-application.e2e-spec` (§15.7) | L (4-6d) |
| **P5 — Open professor** | M4+M5; applications service/controllers; platform review UI; application templates + superadmin alert (mail + new `NotificationType.PROFESSOR_APPLICATION_SUBMITTED`); approve→invite | `professor-application.e2e-spec` | L (4-5d) |
| **P6 — Co-branding polish** | branding settings write path + validation; mail partner block; invite preview branding; web co-branded shells + accept page | template snapshots; visual check | M (3-4d) |
| **P7 — Toast sweep** (§17; incremental per phase, this closes the inventory) | `toast-reasons.ts` map; interceptor exemption-list extension; per-flow success/failure wiring; enumeration-copy review | §17 inventory checked off; no toast fires on uniform-response endpoints beyond the uniform copy | M (2-3d) |
| **P8 — Hardening & docs** | invariant gates final sweep, README onboarding matrix (now incl. org self-signup), runbook (Resend domain/key/limits, community org module grants), JUDGE_QUEUE_RATE_MAX follow-up issue | full gate suite | S-M (1-2d) |

Ordering notes: P3 before P4 because approval **writes** the new quota resources; P4 and P5 are mutually independent (both depend on P1 mail patterns; P5 also on P2's community org). The flip (in P3) must not ship before the caps exist — that window would have neither the old control nor the new one.

**Honest total: 25–36 focused dev-days.** For one developer, with review cycles, gate runs and the usual stabilization between phases, that is realistically **6–8 calendar weeks** — the nine per-phase estimates above are working figures, not a promise that they simply sum. The externally blocked DNS/rate-limit items (§2.5) can run in parallel from day one and cost no dev time.

**Deliberately deferred:** bounce/complaint webhooks + suppression (#118 decision 9 — separate issue; message-id logging in P0 is the hook); open-professor teaching surface (community classrooms) and open-professor student invites; org-facing branding self-service upload (superadmin-set URL in v1); co-branded login door (`/login?org=slug`); Resend batch endpoint; O1 org-less rework (escape path only); applicant-side withdraw endpoint for org applications (status exists; superadmin-set in v1, §15.3).

---

## 14. Open questions — only what is still genuinely undecided

**DECIDED — do not re-open.** admin→professor flat flip; no login until verified; env-driven from-address; origin model O2; key rotation to sending-only (operator, P0 runbook step). And, answered 2026-08-01:

- **The deployment host is the platform-provided `*.up.railway.app` subdomain.** Railway owns that DNS zone, so it can NEVER be verified in Resend. P0's "one real invite delivered on a verified domain" gate is therefore **blocked indefinitely**, not merely pending — it opens only if a self-owned domain is later pointed at the deployment. `onboarding@resend.dev` → the account owner's own inbox is the only live send path until then, and it is a smoke test, not a flow test. Everything else in P0 is verifiable against mailpit. §2.5, §13.
- **Org-approval seat counts are REQUIRED.** Both `maxProfessors` and `maxStudents` are DTO-required on approve — no organisation is ever approved without deliberate caps. Blank-means-unlimited survives only as the *storage* semantic (absent `org_quotas` row), which is now reachable only for the community org, never through the approval path. §15.4, §16.1.
- **ADMINs are NOT counted under `MAX_PROFESSORS`.** Per-role caps count exactly their role; admins count under `MAX_USERS` only. `seatResourceFor(ADMIN)` returns null. §16.2.
- **The org slug is AUTO-GENERATED from the organisation name**, with numeric suffixing on collision — the superadmin does not type it. §15.4 carries the generation + race semantics.
- **Admin email at approval:** prefilled from the applicant contact, editable (the form-filler is not always the intended admin). Taken as a default with no objection.
- **Re-application after rejection:** allowed immediately for both application kinds (uniqueness is pending-only; the superadmin sees full history per email). Taken as a default with no objection. Add a cooldown only if abuse appears.

Still genuinely open — each with recommendation + trade-off. Approving the plan with no comment = approving these recommendations:

1. **Open professor surface in v1:** rec = consumption only (no student invites, no user directory) until a designed "open teaching" phase. Trade-off: an approved open professor can practice but not yet teach; the alternative (open teaching now) drags the community-tenant isolation problem into v1.
2. **Should invite acceptance / password reset mark the email verified?** Rec: **yes** (mailbox access is proven). Say no only if verification is meant as an explicit consent step rather than a proof step.
3. **Community org module profile:** which modules do open users get (rec: problems/playground/topics on; classrooms/assignments/grading off pending Q1)? Pure data via existing #64 grants — no code either way.
4. **`withdrawn` org-application status:** v1 = superadmin marks it on request (applicant has no account); a tokenized "cancel my application" mail link is the future path. OK?

---

## 15. NEW SCOPE — Organisation self-signup (public → superadmin-approved tenant)

The closed ecosystem is no longer superadmin-creates-org-by-hand. Chain: landing-page CTA "Join as an organisation" → public onboarding form → `organization_applications` row → superadmin reviews → **approval creates the org row + per-role seat quotas + the admin invite in one transaction** → admin invites professors and students; professors invite students (§3 matrix).

### 15.1 Entity: `organization_applications` (migration M7)

A **pre-tenant, pre-account** record: at submission there is no user and no org, so it carries **no NOT-NULL FK to either** — `organization_id` is written (nullable, SET NULL) only at approval, as the audit link. Fields/indexes in M7 (§9). Identity = contact person's name + email, org name/type, optional website + free-text message.

### 15.2 The public endpoint (abuse + enumeration)

`POST /organization-applications` (#15 in §7): `@Public`, uniform 202 on every branch — fresh application, duplicate pending (silently swallowed by the partial-unique + explicit pre-check), and **contact email already has an account** (irrelevant at submission; an application is not an account — no oracle). Org name must not be an oracle either: a name matching an existing tenant is **not** rejected (names aren't unique; only slugs are) — the superadmin sees possible duplicates in review. Abuse control on this public write: `@Throttle` 3/min + 10/day per IP (the global `AppThrottlerGuard` buckets unauthenticated traffic by IP), DTO length caps on every field, no file upload. Mails after commit: `ORG_APPLICATION_RECEIVED` to contact; `ORG_APPLICATION_ALERT` + in-app `NotificationType.ORG_APPLICATION_SUBMITTED` (new) to all superadmins.

### 15.3 Status machine

`pending → approved | rejected | withdrawn`. Terminal states are terminal. Approve/reject flip via **conditional UPDATE `WHERE status='pending'` + `affected===1`** (house pattern — no double-approve creating two orgs). Rejection mails `ORG_APPLICATION_REJECTED` (optional reason, escaped). Re-application after rejection: allowed (pending-only uniqueness); superadmin sees history per email. `withdrawn`: superadmin-set in v1 (§14.11).

### 15.4 Approval — the transactional boundary

`POST /platform/organization-applications/:id/approve {adminEmail, maxProfessors, maxStudents, maxUsers?}` — **no `slug` field: it is derived, and both role caps are REQUIRED** (§14 decided). Inside **one transaction**: (1) conditional status flip; (2) create org row (name/type from application, slug auto-generated — see below); (3) write `org_quotas` rows for `maxProfessors`/`maxStudents` (both always present, so an approved org always has deliberate caps; `maxUsers` stays optional = unlimited); (4) mint the admin invite via `invites.create(..., newOrgId)` with the SUPERADMIN actor — reusing token mint, seat reservation (charged against the just-written caps in the same manager), and `uq_org_invites_org_pending_email`. **Mail is enqueued strictly AFTER commit** (`invites.service.ts:130-132` rule: a rollback cannot unsend a mail) — the org-admin-invite mail, plus `ORG_APPLICATION_APPROVED` to the contact only when `adminEmail !== contactEmail`. `OrganizationCache.reload()` after commit (new org row; guard treats unknown as active anyway). Edge: `adminEmail` belongs to an existing account → existing invite machinery answers (org-less/community → CLAIM-as-admin; member of another real org → accept-time `email_unavailable`, superadmin re-invites a different address; the invite row itself still mints fine).

**Slug generation (decided: auto, not typed).** `slugifyOrgName(name)` in a new `organizations/org-slug.util.ts` + spec: lowercase, NFKD-strip diacritics, non-alphanumerics → `-`, collapse runs, trim leading/trailing `-`, truncate to the column's 80 chars **before** suffixing (so a suffix can never push it over the limit). Then collision handling, and the ordering here is the whole point:

- A `SELECT ... WHERE slug LIKE 'base%'`-then-insert is a **race**, not a solution: two approvals of similarly-named orgs in the same second both read "free" and the second insert violates `uq_organizations_slug`. The unique index is the only real arbiter.
- So: attempt the insert with `base`; on a `23505` unique violation specifically on `uq_organizations_slug`, retry with `base-2`, `base-3`, … up to a small bounded number of attempts (say 10), then fail loud. **Each retry needs its own SAVEPOINT** — in Postgres an integrity error aborts the whole transaction, so retrying the insert on the same transaction without a savepoint fails with "current transaction is aborted", which is exactly the bug this note exists to prevent. Wrap step (2) alone in the savepoint; steps (1), (3) and (4) stay in the outer transaction.
- Degenerate names: a name that slugifies to the empty string (all punctuation, all non-Latin script) falls back to `org` as the base, so suffixing yields `org-2` rather than a bare `-2`. Worth a spec case; a Devanagari or CJK-only organisation name is not hypothetical for this product.
- The generated slug is shown in the approve dialog's confirmation and in the approved-application detail, so the superadmin can *see* what was minted even though they did not type it — and a later rename surface (out of scope) is where a chosen slug would belong.

### 15.5 Three request-shaped things — reconciled deliberately

| Thing | Table | Exists before | Reviewer | Uniqueness | Approval side-effect |
|---|---|---|---|---|---|
| (a) Organisation application ⚡ | `organization_applications` | neither user nor org | SUPERADMIN | pending per `lower(contact_email)` | create org + quotas + admin invite |
| (b) Open professor application ⚡ | `professor_applications` | no user; targets the existing community org | SUPERADMIN | pending per `lower(email)` | mint PROFESSOR invite (community org) |
| (c) In-org promotion | `professor_requests` (EXISTING) | user exists, in an org | that org's ADMIN (superadmin cross-org) | pending per `user_id` | `users.setRole(PROFESSOR)` |

**Three tables, not one discriminated table.** The FK shapes are irreconcilable ((c) has NOT-NULL `user_id`; (a) has neither FK), the uniqueness keys differ (email vs user_id), the reviewers differ (org admin vs platform), and the approval side-effects share no code path. A shared table would make every column nullable and every query conditional — against the codebase's mirrored-parallel-tables house style (`password-reset-token.entity.ts` doc-comment). Naming convention makes the split legible: `*_applications` = pre-account public asks reviewed on the platform console; `*_requests` = in-org asks reviewed in the org console. The two platform review queues share one UI shape (tabs on the console).

**`professor_requests` keeps a real purpose** now that admins invite professors directly: invites are for *addresses* (new or claimable accounts) — an existing same-org member who receives one gets `already_member` with **no role change** (`acceptAsExistingUser`, `invites.service.ts:371-376`). Promoting an existing in-org student to professor therefore still runs through `professor_requests` (self-service ask) or `PATCH /users` (staff-initiated) — both now professor-cap-checked (§16). `admin-requests-page.tsx` stays as-is.

### 15.6 Origin model re-test (coordinator ask): O2 stands

Org self-signup creates **real tenants** through superadmin approval; open users still live in the community tenant; the flows touch only at one point — an org-application contact who already has a community/org-less account, which resolves through the already-specified CLAIM path (§4.3.1, §15.4 edge). No new state for `users.origin` (members arriving via the new org's invites are `origin='closed'` as before — provenance semantics unchanged). Nothing in §4 is weakened; no constraint work appears. **O2 confirmed.**

### 15.7 Tests

Unit: service branches (uniform 202 ×3), conditional flip race, mail-after-commit ordering (spy). Slug util: diacritics, punctuation-only name → `org` fallback, 80-char truncation before suffixing, suffix sequence. Slug collision: approving two applications whose names slugify identically yields `base` and `base-2` with **both orgs created** (the savepoint retry works — the second approval must NOT fail, which is the regression this test pins); a forced unresolvable collision fails loud and rolls back leaving no org/quotas/invite rows. Missing `maxProfessors`/`maxStudents` → 400 (they are required). e2e `org-application.e2e-spec.ts`: apply(uniform) → superadmin approve(counts, admin email) → org exists with the derived slug, quotas readable via platform detail, admin-invite mail's token accepts → admin signs in co-branded-ready → admin invites a professor (§3) and a student; duplicate-pending uniform; reject path; approve-twice 409.

---

## 16. NEW SCOPE — Per-role seat counts (`MAX_PROFESSORS`, `MAX_STUDENTS`)

### 16.1 Resources + storage

`QuotaResource` (modules/quotas/enums) gains `MAX_PROFESSORS='max_professors'`, `MAX_STUDENTS='max_students'`; `org_quotas.resource` CHECK widened by **M6** exactly as the enum's comment mandates (never ALTER TYPE). Absent row = unlimited (unchanged semantics — the community org simply has no rows). Note the interaction with §14's decision that both role caps are **required at approval**: absent-row-unlimited is therefore no longer reachable for a self-signup tenant, only for the community org and for any org created before this work. So the console must still render "unlimited" correctly — the state persists in existing data even though the approval path can no longer mint it. `ALL_QUOTA_RESOURCES` picks the new values up automatically; audit its consumers (usage summary, platform detail, `org-quota-form.tsx`) render the two new rows.

### 16.2 The counting predicate — one shared helper, per-role

`QuotaService.countSeats` (`quota.service.ts:175-187`) counts `active users + pending invites WHERE expires_at > now()`, and its comment binds `PlatformMetricsService.census()` to the IDENTICAL predicate ("the two must move together"). The per-role counters reuse that exact shape with an `AND role = $role` term on **both** subqueries (pending invites carry `role` — a pending professor invite holds a professor seat, so acceptance stays net-zero per role; expired-but-still-pending rows stay excluded). **Upgrade the comment-contract to code:** extract the two SQL fragments into one shared helper (e.g. `quotas/seat-predicate.ts` exporting the users/invites WHERE clauses) consumed by both `QuotaService` and `PlatformMetricsService`, plus a unit test asserting `currentUsage(MAX_PROFESSORS)` === census's professor figure on the same fixture — drift becomes a red test, not a console/enforcement disagreement. **ADMIN rows count under `MAX_USERS` only — DECIDED** (§14): `seatResourceFor(ADMIN)` returns null, so promoting or inviting an admin never consumes a professor seat, and "professors: 10" on the approval form means ten teachers. A parity test asserts an org at its professor cap can still receive an admin invite.

### 16.3 Enforcement points (every place a role-bearing seat is created OR CONVERTED)

All go through the existing `quotas.assertWithinQuota(orgId, resource, delta, manager)` **inside the caller's transaction** (that manager is what makes the lock real — `invites.service.ts:103-108`):

1. `invites.create` — assert `MAX_USERS` **and** the role's cap for `dto.role`.
2. Bulk roster (`bulk/` controller) — per-role delta per batch; verify at implementation whether it loops `invites.create` (then free) or has its own transaction (then add the per-role assert there).
3. `invites.accept` / `claim` — same pair, consume-first order preserved (net-zero per §16.2, but the assert stays as the double-accept backstop, mirroring `MAX_USERS` today).
4. `users.service.create` (staff-created users) — role's cap.
5. **`PATCH /users` role change — the named bypass**: converting a student→professor mints a professor seat with no invite; `setRole`/update path must assert `MAX_PROFESSORS` delta +1 (and student→professor also *frees* a student seat — no assert needed on the freeing side).
6. **`professor_requests` approval — the second bypass**: `onboarding.service.approveRequest` calls `users.setRole(PROFESSOR)` (`onboarding.service.ts:79`) — same assert, else the promotion flow silently overruns the cap the invite path enforces.
7. `users.assignOrg` (unassigned-pool placement, role student) — `MAX_STUDENTS`.

Centralize: put the role→resource mapping in one function (`quotas/role-seat.util.ts`: `seatResourceFor(role): QuotaResource | null`, null for SUPERADMIN/ADMIN) so no call site hand-picks the enum.

### 16.4 Cap lowered below current usage

Legal, non-destructive (matches existing `MAX_USERS` behaviour): existing members keep their seats; every *new* mint/conversion 409s `quota_exceeded` until usage falls below the cap; the platform console's `QuotaUsageDto.exceeded` already renders the over-cap state. State this in the `org-quota-form` helper text.

### 16.5 Tests

Unit: predicate-parity (census vs quota) per role; `seatResourceFor` map; each enforcement point's assert wired (spy on `assertWithinQuota`). e2e: org approved with `maxProfessors=1` → first professor invite ok, second 409 `quota_exceeded`; pending professor invite holds the seat (second invite blocked before any accept); expired invite frees it; `PATCH /users` student→professor blocked at cap; `professor_requests` approval blocked at cap; lowering below usage blocks new mints only.

---

## 17. NEW SCOPE — Toasts everywhere

### 17.1 Existing stack (verified — build on it, add nothing)

sonner `^2.0.7`; `<Toaster richColors position="top-right" />` mounted in `main.tsx:26` via the shadcn wrapper `components/ui/sonner`; ~30 feature files already call `toast.*`; `lib/api-client.ts` has `toastOnce` (3s dedupe per reason, lines 36-43) and a **reason-code-driven global interceptor** (`module_disabled`, `entitlement_required`, tenant rejections) plus an exemption list for auth/invite endpoints (lines 30-34). No new library.

### 17.2 Architecture

- New `lib/toast-reasons.ts`: one map `reason → {copy, severity}` for **server-driven** toasts. The API already returns stable machine-readable `reason` codes in every domain exception (`invite.exceptions.ts`, `InvalidResetTokenException`, guards) — that contract is what makes this map possible; every NEW exception in this plan ships a `reason` for the same purpose.
- Division of labour: the **interceptor** keeps only cross-cutting reasons (module/entitlement/tenant — as today); **flow-specific** reasons are toasted by the mutation's `onError` reading `error.response.data.reason` through the shared map. Extend the interceptor exemption list with the new public endpoints so nothing double-toasts.
- **Governing rule — "page-state for arrival, toast for action":** token states discovered on page load (invalid/expired/used invite, verification, reset links — all served by never-throwing previews) render as **page states** with a recovery CTA, never toasts; toasts fire only on user-initiated actions.

### 17.3 Inventory (S=server-driven via `reason`, C=client-only)

| Flow | Success toast | Failure toasts |
|---|---|---|
| Register / resend-verification / forgot-password / org-apply / professor-apply | **Uniform copy, always** ("If that address can receive mail, instructions are on the way" / "Request sent — we'll email you") — the toast IS the uniform response; **never** an "already exists" error (enumeration) | C network-only ("Couldn't reach the server — try again") |
| Login | none (navigation is the feedback) | S `email_unverified` → "Verify your email first — we can resend the link" + resend action button. **Enumeration note:** this reason is only reachable AFTER a correct password (§5.2), so the toast reveals existence only to someone already holding the credential — reconciled with the uniform-200 register design. Wrong password stays the generic 401 copy. |
| Verify email / reset password (action submit) | "You're in — welcome" / "Password updated" | S `verify_token_*` / `reset_token_*` → page-state, not toast (rule §17.2); S `account_disabled` → toast with admin-contact copy |
| Invite accept / claim | "Invitation accepted — welcome to {org}" / "Joined {org}" | S `invite_expired`/`invite_revoked`/`invite_already_accepted` → page-state; S `account_exists`+`claimRequired` → toast + redirect to login ("Sign in to accept this invitation"); S `email_unavailable` → neutral copy ("This invitation can't be used with that address") — no tenant hint |
| Invite mint (single + dialog) | "Invitation sent to {email}" | S `invite_already_pending`, `role_not_invitable`, `org_suspended`; S `quota_exceeded` → **name the resource**: "Professor seats are full (10/10) — ask CodeStack to raise the cap" (payload carries resource); C validation |
| Invite resend | "Invitation re-sent — previous link is now invalid" | S `invite_resend_cooldown` → uses `retryAfterSeconds` from the exception payload: "Wait {n}s before resending" (live countdown optional) |
| Invite revoke | "Invitation revoked" | S generic |
| Bulk roster | "{n} invitations queued" + per-row error table (page UI, not toast spam — one summary toast max) | S `quota_exceeded` summary toast |
| Org application review (approve/reject) | "{org} approved — admin invite sent" / "Application rejected" | S 409 already-reviewed → "Someone else just reviewed this" + list refetch; S slug conflict → inline field error (form, not toast) |
| Professor application review | same shape | same shape |
| Quota form save | "Seat limits updated" | S validation; C unchanged-noop |
| Pending states (org/professor application, unassigned) | none — these are page/banner states, not toasts | — |
| Claim/org-assignment (student side) | in-app notification + `org-assigned` mail already cover it; toast only on the active claim action ("Joined {org}") | — |

### 17.4 Tests / gate

Unit-test the reason map (every `reason` string emitted by the API exceptions above has an entry — enumerate from the exception classes so a new reason without copy fails a test). The P7 gate walks this table. Enumeration review: no error toast may fire on the five uniform endpoints (asserted by the exemption list + code review).
