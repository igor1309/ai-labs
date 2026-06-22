---
name: agonara-api-access
author: Igor Malyarov
version: "1.0.1"
description: Connect any agent to an Agonara instance over its HTTP API — health check, password login and the agonara_session cookie, whoami, the X-Agonara-CSRF token and idempotency keys for safe mutations, and reading the accepted/rejected/fault envelope. Use when an agent needs to authenticate to Agonara, hold a session, send a state-changing request, or interpret an Agonara API response. The shared foundation every Agonara role skill builds on.
trigger: before any agent talks to an Agonara instance — authenticating, holding a session, mutating, or interpreting a response
---

# Agonara API access

Teaches an agent to talk to an Agonara instance at all: connect, sign in, hold a
session, send mutations correctly, and read the result. Every role skill leans on
this one.

## What you need (the only assumptions)

- An **instance URL** (the API base, e.g. `https://your-agonara.example`).
- **Credentials** — a login and password for an identity on that instance.
- The instance's **Agonara OpenAPI contract**, which is the source of truth for
  routes, request bodies, status codes, and rejection reasons.

Nothing else: no repository, no source checkout, no build or test tooling, no
particular agent runtime.

## Connect

- `GET /operations/health` — no auth. Returns a bare health document
  `{ "status": "ok", "checkedAt", "requestId", "version" }`. This is the **one**
  endpoint that does **not** use the standard envelope below; `status: "ok"`
  here means "service up", not the `accepted` result status.
- `GET /identity/bootstrap/status` — no auth. Use only to learn whether an
  instance still needs its first Admin; it returns the standard envelope.

## Authenticate and hold a session

Agonara uses a server-managed, opaque session cookie named **`agonara_session`**.

1. **Log in** — `POST /identity/sessions` with body `{ "login", "password" }`.
   No session or CSRF token is needed (you have none yet). On success the
   response sets the `agonara_session` cookie; send that cookie on every
   subsequent request.
2. **Whoami / get a CSRF token** — `GET /identity/session` resolves the current
   session and returns a CSRF token in the accepted envelope's `value`. Call it
   after login (and whenever you need a fresh CSRF token).
3. **Log out** — `DELETE /identity/session`. This is itself a mutation, so it
   requires the session cookie **and** the `X-Agonara-CSRF` header. It clears
   the cookie.

## Mutations: CSRF + idempotency

**CSRF.** Every state-changing, session-backed request requires the
**`X-Agonara-CSRF`** header carrying the token from `GET /identity/session`.
Omitting or mismatching it is rejected with reason `csrf_required` /
`csrf_invalid`. Mutations that run *before* you have a session — login
(`POST /identity/sessions`) and first-Admin bootstrap — carry no CSRF token and
are not CSRF-protected. Treat CSRF as required for any session-backed mutation
unless the contract's security block for that operation says otherwise.

**Idempotency.** The **`X-Agonara-Idempotency-Key`** header makes a submission
safe to retry: the server records the key and will not apply the same operation
twice. The contract marks this key **required for Student attempt submissions**;
the API never echoes it back. Reusing a key for a conflicting request is rejected
with `idempotency_conflict`. (Generating and sending the key for a specific
submission is the relevant role skill's job; this skill only defines the
mechanism.)

## Read the envelope

Every JSON operation response (health excepted) is exactly one of three shapes:

| `status`   | Shape                                  | Meaning |
|------------|----------------------------------------|---------|
| `accepted` | `{ "status": "accepted", "value": … }` | Success. Read `value`. |
| `rejected` | `{ "status": "rejected", "reason": … }`| The request will not succeed unchanged. |
| `fault`    | `{ "status": "fault", "reason": "internal_error" }` | Unexpected server fault (details redacted). |

Status families track this: `200` → accepted; `400/401/403/404/409/429` →
rejected; `500` → fault.

**Retry vs. stop**, driven by the result:

- **`accepted`** — done; use `value`.
- **`fault`** — transient server-side; safe to retry, reusing the same
  idempotency key where one applies.
- **`rejected`** — do **not** blind-retry; branch on `reason`:
  - `session_expired` / `session_not_found` / `session_revoked` → re-authenticate, then resend.
  - `csrf_required` / `csrf_invalid` → fetch a fresh token via `GET /identity/session`, then resend.
  - `rate_limited` → back off, then retry.
  - `idempotency_conflict` → you reused a key for a different request; use a new key.
  - anything else (e.g. `validation_failed`, `not_found`, `*_required` authorization reasons, domain conflicts) → fix the request or stop; resending unchanged will fail again.

`reason` is always a value from the contract's `ApiRejectionReason` enum — treat
that enum as the authoritative list and honor the reason the API returns rather
than inferring hidden state.

## Stay inside what the API tells you

Read state through the API's own projections and act on the envelope it returns.
Do not infer authority, membership, or visibility the response did not grant —
the instance enforces those boundaries and a `rejected` reason is the contract
telling you where they are.

## You are the interface, not a route directory

Agonara is bring-your-own-agent: **you** hold the session and call the API, so
the operator does not. When asked to view, list, check, or confirm anything,
call the relevant read endpoint yourself and present the result inline — titles,
bodies, statuses, ids, whatever they asked about. Never answer a "how do I see
this?" question by handing the operator a raw endpoint path (a `GET` on some
`/programs/...` route)
to call themselves: reciting the route is the agent offloading its own job. The
operator runs an agent precisely so they don't touch HTTP. If they want a
browsable view of their own, point them at the instance's `/learn` (curator/
student) or `/admin` UI — but still show them what they asked for first.
