---
date: 2026-02-21
model: gpt-5.2
description: "Decision: composition root layering, hard module walls, and acceptance test strategy"
---

# Decision: Composition Root, Layering, and Tests

## Status
Accepted (2026-02-21).

## Context
We want hard walls between modules from day 0:
- Each module owns its own domain and its client-owned protocols.
- Only composition (in the Worker entrypoint module, possibly layered) knows about multiple modules and does mapping/adaptation.
- No shared contract module/package between frontend and backend.

We’re deploying the backend as a separate Cloudflare Worker service.

## Decisions
### Composition Root location
The composition root is anchored at Worker entrypoints (`fetch(request, env, ctx)`), because this is the only module that must know about Cloudflare `env` bindings, secrets, and lifecycle hooks. Cloudflare specifics must not leak into core modules.

### Module boundaries
Minimum core modules:
- `profession-normalizer` module: owns normalization behavior and its protocols (e.g. model client, cache).
- `profession-outlook` module: owns outlook behavior and its protocols (e.g. model client, cache).

Composition module:
- `worker-api` module: owns Worker entrypoints and composition root; imports core modules; provides adapters that conform to client-owned protocols; maps HTTP DTOs ⇄ core types.

Frontend module:
- `web` module: owns UI and its DTOs; does not import core modules; relies on the runtime API contract only.

No shared contract package is introduced.

### Normalizer → outlook bridging
The Worker composition maps normalizer output into outlook input.
- Outlook accepts `canonicalProfession` + `locale` plus optional hints (e.g. `category`, confidence values).
- Hints are optional and must not create compile-time dependency between core modules.

## Tests
### Unit tests for composition wiring (primary in v1)
Tests live in `worker-api` and validate end-to-end wiring through composition without real infra:
- Use spies (not Map-backed stores) for:
  - model clients (capture payload, return stubbed output)
  - caches (capture keys/puts, return stubbed hits/misses)
  - counters store (capture increments)
- Assert:
  - correct payloads to model clients
  - correct cache keys and read/write behavior
  - popularity counters increment on cache hit and miss
  - `needsClarification` is a successful response path (no outlook call)

### E2E tests (smoke)
Keep a small set of Playwright tests to validate web ↔ worker integration:
- happy path answer
- clarification path
- transport error rendering

## Consequences
- Backend API contract is locked by `worker-api` acceptance tests, not by shared types.
- Composition code is the only place that can “see everything”; core modules remain portable and testable.
