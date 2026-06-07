---
date: 2026-06-07
model: gpt-5
description: "Forward tasks for Agonara OpenAPI automation and API skill alignment."
---

# Agonara API TODO

## OpenAPI Automation

- Add near-term contract guardrails while `openapi.yml` remains hand-edited:
  - Redocly lint.
  - YAML parsing and local `$ref` validation.
  - Drift test comparing an explicit route inventory to OpenAPI paths.
  - Drift test comparing `httpStatusFor(...)` rejection reasons to `ApiRejectionReason`.
- Introduce a small route contract registry, for example `agonara/src/http-contract.js`, where every route declares:
  - method and path;
  - operation id and tag;
  - auth requirements;
  - request body schema;
  - possible status codes;
  - response envelope.
- Generate `agonara/docs/api/openapi.yml` from the route contract registry.
- Add `scripts/generate-agonara-openapi.mjs --check` so CI fails when generated output differs from the committed contract.
- Use the route contract registry as the source of truth for server routing and route-level contract tests, so automation does not depend on brittle regex extraction from `server.js`.

## Operator Skills (BYOA)

- Operator-facing BYOA skills live under `agonara/skills/`. They consume the
  published OpenAPI contract as their substrate — keep the contract authoritative
  so those skills never duplicate hidden route knowledge. Design and rationale:
  `agonara/docs/plans/byoa-operator-skills.md`.
