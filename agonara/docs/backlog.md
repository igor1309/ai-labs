---
date: 2026-06-07
model: gpt-5
description: "Deferred design decisions and forward tasks for Agonara."
version: 0.0.12
---

# Backlog

## OpenAPI automation

The route-level OpenAPI 3.1 contract at `docs/api/openapi.yml` is reviewed and
hand-edited. Remaining automation work is to move the contract source of truth
into route declarations that the server and contract can share:

- Introduce a small route contract registry, for example
  `agonara/src/http-contract.js`, where every route declares method and path,
  operation id and tag, auth requirements, request body schema, possible status
  codes, and response envelope.
- Generate `docs/api/openapi.yml` from the route contract registry.
- Add `scripts/generate-agonara-openapi.mjs --check` so CI fails when generated
  output differs from the committed contract.
- Use the route contract registry as the source of truth for server routing and
  route-level contract tests, so automation does not depend on brittle regex
  extraction from `server.js`.

Operator-facing BYOA skills live under `skills/` and consume the published
OpenAPI contract as their substrate. Keep the contract authoritative so those
skills never duplicate hidden route knowledge. The implemented skill design and
rationale live in `docs/plans/implemented/byoa-operator-skills.md`.

## Under consideration

Documents parked in an `under-consideration/` folder need an owning decision before downstream docs are revised. Do not let that folder go stale.

No active under-consideration documents.

When a parked document is resolved, move it out of `under-consideration/` (into `agonara/docs/` for accepted direction, or `archive/` if rejected) and log the decision in `agonara/docs/log.md`.
