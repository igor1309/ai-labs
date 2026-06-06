---
name: agonara-api
author: Igor Malyarov
version: "0.1.0"
description: Work with Agonara API contracts, HTTP routes, client calls, contract tests, and API-first agent automation. Use when implementing, changing, consuming, debugging, or reviewing Agonara endpoints, session/CSRF behavior, accepted/rejected/fault envelopes, role authorization, student-safe projections, curator/admin routes, or API-backed agent workflows in the `agonara/` project.
---

**Announce:** "I'm using the agonara-api skill to work from Agonara's API contracts."

# Agonara API

Use this skill to work with Agonara as an API-first product. Browser surfaces,
operator commands, and future agent automation should use the same backend
contracts instead of coupling to one UI.

## Workflow

1. Read the current Agonara snapshot in `agonara/README.md`, then read the
   relevant spec under `agonara/docs/specs/` before changing or consuming an
   endpoint.
2. Read [API contract map](references/api-contract-map.md) when selecting the
   route family, auth shape, role boundary, response envelope, or redaction
   rule.
3. Read [implementation workflow](references/implementation-workflow.md) when
   adding, changing, testing, or diagnosing HTTP routes.
4. Treat `agonara/src/server.js`, the owning domain module, and the HTTP tests
   as implementation evidence only after the spec boundary is known.

## Hard Rules

- Keep API routes owned by the module that owns the behavior. Do not place
  product policy in generic transport helpers.
- Preserve the shared response shape: domain APIs return `accepted`,
  `rejected`, or `fault` results; HTTP adapters map those results to status
  codes without leaking internals.
- Require the session cookie for authenticated reads and `X-Agonara-CSRF` for
  session-backed mutations, except the documented bootstrap/login routes.
- Preserve ownership-safe projections. Student responses must not expose
  curator drafts, answer keys, provider diagnostics, raw prompts, raw model
  responses, secrets, session identifiers, CSRF tokens, SQL text, stack traces,
  filesystem paths, database URLs, or infrastructure details.
- For code changes, use the repo's strict TDD and process-gate rules in
  addition to this skill.

## References

- [API contract map](references/api-contract-map.md): route families,
  source-of-truth documents, auth/CSRF rules, response shape, and ownership
  boundaries.
- [Implementation workflow](references/implementation-workflow.md): route
  implementation, debugging, tests, and verification commands.
