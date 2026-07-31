#!/usr/bin/env bash
#
# The grep gates from the #109 tracking issue ("Remove Clerk"), made runnable.
#
# They were prose in an issue body, which means they stop being checked the moment
# that issue closes. Each gate below states an invariant the epic established and
# is easy to break by accident later: re-adding a provider SDK, reintroducing a
# retired table, widening `@AllowsUnassigned`, or coalescing a null quota limit
# to 0. The comment on each says what breaks if it fails, because a bare grep
# count tells a future reader nothing.
#
# COMMENTS ARE EXCLUDED from every gate. A doc comment saying "X was retired in
# #104, use Y" is exactly what a future reader needs; a gate that counted it as a
# violation would pressure someone into deleting the explanation to get green.
# These gates are about what the code DOES.
#
# Two gates are scoped more tightly than the issue's literal text; the reason is
# recorded inline in both cases. The issue's strings were written before the
# replacement code existed and now over-match it.
#
# Exits non-zero on the first violation. No network, no DB, no build.
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
API=apps/api/src
WEB=apps/web/src

# Drops `path:12:   * ...` and `path:12:  // ...` — comment-only lines.
strip_comments() { grep -vE ':[0-9]+: *(\*|//|/\*)'; }

# $1 human name, $2 expected count, $3.. the grep to run
gate() {
  local name="$1" want="$2"
  shift 2
  local out got
  out=$("$@" | strip_comments)
  got=$([ -z "$out" ] && echo 0 || printf '%s\n' "$out" | wc -l | tr -d ' ')
  if [ "$got" = "$want" ]; then
    printf '  ok    %-52s %s\n' "$name" "$got"
  else
    printf '  FAIL  %-52s %s (expected %s)\n' "$name" "$got" "$want"
    printf '%s\n' "$out" | sed 's/^/          /'
    fail=1
  fi
}

echo "invariant gates (#109)"

# --- Clerk excision (#102) -------------------------------------------------
# Three APPLIED migrations name the columns they drop and are never edited, so
# the sweep excludes that directory exactly as the issue specifies.
gate "no clerk reference in application code" 0 \
  grep -rniE clerk "$API" "$WEB" --exclude-dir=migrations

# --- retired professor-invite system (#101) --------------------------------
# The dropped table must have no readers or writers. Scoped past the migration
# CLASS name DropProfessorInvites1785540000000, which is applied and never edited.
gate "no reference to the dropped professor_invites table" 0 \
  grep -rn professor_invites "$API" "$WEB" --exclude-dir=migrations

# The retired enum was `InviteStatus`. #108 added a NEW `InviteStatus` in
# apps/web/src/types/invite.ts for ORG invite status — a substring collision with
# the old name, not a survivor — so this gate covers the API only, and the
# `[^A-Za-z]` prefix keeps it from matching today's `OrgInviteStatus`.
gate "retired InviteStatus enum gone from the API" 0 \
  grep -rnE "(^|[^A-Za-z])InviteStatus" "$API" --exclude-dir=migrations

# --- org-less confinement (#104) ------------------------------------------
# Every one of these is a hole in TenantContextGuard, and each must be owner- or
# token-scoped. A new one is a decision that needs review, not a number to bump:
# if this fails, read the new site before you change the 5.
gate "@AllowsUnassigned application sites (allowlist = 5)" 5 \
  grep -rn "@AllowsUnassigned()" "$API"

# --- quota null-vs-zero (#66) --------------------------------------------
# `limit === null` means UNLIMITED; `0` means BLOCKED. Coalescing the former into
# the latter turns every uncapped org into a fully blocked one. Row COUNTS may
# still coalesce — `Number(rows[0]?.count ?? 0)` is correct — which is why this
# targets limit-bearing identifiers rather than the issue's bare `?? 0`.
gate "no quota LIMIT coalesced to zero" 0 \
  grep -rnE "(limit|Limit|max[A-Z][A-Za-z]*)[^;]*\?\? *0" apps/api/src/modules/quotas

# --- Resend API key containment (#118) ------------------------------------
# There is NO log-redaction layer in this app: nestjs-pino is a dependency but
# LoggerModule is registered nowhere, so `EMAIL_PASSWORD` is protected only by never
# being interpolated into a log line. `RESEND_API_KEY` inherits exactly that
# discipline, which means the discipline has to be checkable.
#
# Three reads, and they are the only three that can exist without widening the
# key's blast radius: the config factory that loads it, and the two lines in
# `ResendMailTransport` that check it is present and store it. Anything else — a
# service reaching for the key, a controller passing it around, a second transport
# — needs the review this gate forces. Specs are excluded: their fixtures use a
# fake `re_TESTKEY...` value on purpose, and `resend-mail.transport.spec.ts` is
# where the "no key in any thrown error or log call" assertion lives.
gate "RESEND_API_KEY read only by config + Resend transport" 3 \
  grep -rn --include=*.ts --exclude=*.spec.ts "resendApiKey" "$API"

# The raw env var itself has exactly one reader — the config factory. A second one
# would be a path that bypasses the containment above.
gate "process.env.RESEND_API_KEY has one reader" 1 \
  grep -rn --include=*.ts "process.env.RESEND_API_KEY" "$API"

# --- web has no TS enums (erasableSyntaxOnly) -----------------------------
# tsconfig sets erasableSyntaxOnly, so a TS `enum` fails the build too — this
# catches it at review time rather than in CI.
gate "no TS enum in the web workspace" 0 \
  grep -rn "enum " "$WEB"

if [ "$fail" -ne 0 ]; then
  echo "invariant gates FAILED"
  exit 1
fi
echo "all invariant gates pass"
