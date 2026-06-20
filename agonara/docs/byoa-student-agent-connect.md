---
date: 2026-06-20
model: claude-opus-4-8
description: "Host-agnostic procedure for connecting an external BYOA agent to a deployed Agonara instance as a student (learner)."
---

# Connecting a BYOA Student Agent to an Agonara Instance

Host-agnostic procedure for wiring an external agent to a deployed Agonara
instance as a **student** (learner). The concrete wiring of a specific
agent/host — addresses, identity ids, credential paths — belongs in the
operator's own inventory, not in this repo. Admin and curator connection are out
of scope here.

## Prerequisites

- A reachable Agonara instance URL (public HTTPS, or otherwise network-reachable
  from the agent).
- Admin access to that instance (admin credentials, or the bootstrap secret if no
  Admin exists yet) to provision the student identity.
- An agent runtime that can both make HTTP requests and read a local file for
  credentials.
- The Agonara skills `agonara-api-access` and `agonara-membership` (shared
  foundations) and `agonara-student`.

## Step 1 — Provision a student identity (admin)

Using the `agonara-admin` skill against an Admin session:

1. `POST /identity/identities` with `{ "displayName" }` — record the returned
   identity `id`.
2. `POST /identity/identities/{identityId}/local-password` with
   `{ "login", "password" }` — generate a strong password.

The result is a learner identity (`isAdmin: false`) with a password credential.
It holds no program participation; the student self-joins programs later through
the student skill.

## Step 2 — Place credentials where the agent reads them

Store the instance base URL and the student `login`/`password` where the agent
can read them at runtime — e.g. a `0600` env file in the agent's home. Never
commit them to the repo, and keep the password out of any shared transcript.

## Step 3 — Install the skills into the agent

Copy the three skill folders into the agent's skill directory. Add a small
non-secret reference note telling the skill where the credentials and the
instance's `openapi.yml` contract live. Runtimes that use the `SKILL.md` format
(Claude Code, Hermes) auto-discover dropped-in folders; confirm against the
runtime's own skill docs.

## Step 4 — Verify

From the agent's host/runtime:

1. `GET /operations/health` → `status: ok`.
2. `POST /identity/sessions` with the student credentials → `accepted`.
3. `GET /identity/session` → identity shows the student `displayName` and
   `isAdmin: false`.

Then trigger the student skill and do one read before any mutation.

## Notes

- Cookie + CSRF is the only auth path today: send the `agonara_session` cookie
  and the `X-Agonara-CSRF` token from `GET /identity/session` on every
  session-backed mutation. An agent that can hold a session uses it directly.
  Bearer-token auth is a future addition — see
  [`../backlog/agent-connectivity.md`](../backlog/agent-connectivity.md).
- Admin stays operator-gated. Do not wire an agent to Admin over a public route
  while the remote-admin-access decision is open (same backlog file).
