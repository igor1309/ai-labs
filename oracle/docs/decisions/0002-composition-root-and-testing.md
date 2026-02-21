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

### Composition layering
Composition code is split into two distinct kinds of components:

1. Wiring composers
- Functions that connect abstractions (interfaces) to abstractions (interfaces).
- They perform payload/response mapping and call ordering only.
- Their parameters are interfaces (abstract-factory style).

2. Assemblers
- Functions that take concrete module instances and provider bindings (e.g., Worker `env`) and produce adapters/decorators that fit client-owned interfaces.
- Assemblers plug concrete adapters into wiring composers to create a deployable entrypoint.
- Assemblers may be layered/cascaded (assembler builds adapters → wiring composer builds handler → final assembler returns Worker `fetch`).

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
### Wiring composer tests (primary in v1)
Tests live in `worker-api` and validate payload/response chaining without real infrastructure:
- Use spies (not Map-backed stores) for:
  - request guard (captures request body → returns guard result)
  - normalizer (captures payload → returns normalizer result)
  - outlook service (captures payload → returns answer)
  - popularity counters store (captures increments)
  - request id generator (returns deterministic id)
- Assert:
  - payload/response chaining across interfaces (payload → response → payload → response)
  - short-circuit paths (`needsClarification` and invalid requests)
  - required side effects (popularity counters)
  - dependency validation failures (missing/invalid collaborator shapes)

### Assembler tests
Assemblers are tested separately from wiring composers:
- Verify concrete adapter assembly and binding correctness (KV/D1/OpenRouter config, binding names, prompt version selection).
- Use spies at the adapter boundaries to validate the assembled graph, but do not re-test wiring composer behavior here.

### Module tests
Each module owns and tests its own behavior (including any caching keys/policy inside module-owned cache decorators) and does not rely on composition tests for correctness.

### E2E tests
E2E tests are required once core behavior exists:
- Validate web ↔ worker integration and user-visible flows end-to-end.
- Before core modules exist, only deployment smoke checks are meaningful (for example `/health` and “returns structured JSON”).

## Consequences
- Backend API contract is locked by `worker-api` acceptance tests, not by shared types.
- Composition code is the only place that can “see everything”; core modules remain portable and testable.

## Implementation status
- [x] Wiring composer: interface-only Worker wiring in `worker-api`
- [x] Wiring composer tests: spies-based payload/response chaining
- [x] Cloudflare Worker service scaffold deployed (separate backend service)
- [ ] Assemblers: concrete adapters (OpenRouter, KV, D1) and final Worker `fetch` assembly
- [ ] Implement `profession-normalizer` module (client-owned protocols + behavior + tests)
- [ ] Implement `profession-outlook` module (client-owned protocols + behavior + tests)
- [ ] Add E2E tests once behavior exists
