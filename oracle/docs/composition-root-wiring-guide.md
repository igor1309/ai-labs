---
date: 2026-02-22
model: gpt-5
description: "Composition root rules for interface-only wiring, layered assembly, environment wiring, and wiring tests"
---

# Composition Root Wiring Guide

## Purpose
Define how composition root code is created, assembled, and tested in this repo.

## Definition
Composition root is the place that knows all collaborating pieces and connects them.

Composition root is not business logic.

## Core Rule
Composition wiring must only connect interfaces and map payload/response shapes between interfaces.

If behavior is more than payload/response mapping between interfaces, it is not composition wiring.

## What Is Allowed in Composition
- Dependency presence and shape validation.
- Call ordering across interfaces.
- Payload adaptation from one interface to another.
- Response adaptation from one interface to another.
- Wiring-layer decorators by interface composition (for example cache wrappers) when the layer still exposes interfaces.

## What Is Not Allowed in Composition
- Domain/business decisions.
- Concrete caching logic (keys, hit/miss policy, cache reads/writes).
- Normalization/derivation algorithms.
- Transport/provider-specific implementation details.
- Default placeholder implementations that hide missing wiring.
- Inline stub/fake behavior inside wiring composers or assemblers.
- Any fallback to in-memory/demo behavior in production mode.

## Interfaces First
Composition should declare required collaborators by interface shape.

Example required interface shapes:
- `requestGuard.validate(input) -> guardResult`
- `professionNormalizer.normalize(input) -> normalizerResult`
- `professionOutlookService.getOutlook(input) -> answer`
- `popularityCountersStore.increment(canonicalProfession)`
- `requestIdGenerator() -> string`

These shapes serve two purposes:
1. Drive assembly requirements.
2. Drive wiring tests using spies.

## Layered Assembly
Use assembly in layers:

1. Wiring composer:
Creates a composed piece from interface dependencies.

2. Adapter assembler:
Builds concrete adapters for modules/providers and maps concrete types to interface shapes.

3. Final assembler:
Plugs adapters into wiring composer and returns deployable entrypoint.

If another composition layer is needed (for example cached service wrapper), create another wiring composer that still consumes and exposes interfaces.

## Environment-Specific Adapter Policy
Environment-specific behavior (for example test/dev/demo providers) is allowed only when it is intentionally separated and explicitly composed.

Rules:
- Alternate providers must live in dedicated adapter modules, not inline in assembler or wiring files.
- Final assembler may select between adapters by explicit environment/config mode.
- Mode selection must be fail-closed for production (no implicit fallback to stubs).
- Production and non-production wiring choices must be documented in spec/inventory docs.
- Wiring tests assert only interface contracts; adapter behavior tests live with the adapter.

## Stub/Fake Prohibitions (Hard)
- Do not embed deterministic fake business outputs in `make*Fetch`, router wiring, or other composition functions.
- Do not mix adapter creation and fake domain behavior in one function.
- Do not use stubs as silent defaults when required production dependencies are missing.
- Do not let test-only providers leak into production code paths without explicit mode gating.

## Testing Composition Wiring
Wiring tests use spies only, not concrete infrastructure.

Verify chain correctness:
1. payload into first interface,
2. mapped payload into next interface,
3. mapped response out,
4. short-circuit paths,
5. required side effects (for example counters),
6. dependency validation failures.

Dependency-validation expectations:
- Validate missing dependency failures for every required collaborator.
- Validate invalid shape failures for every required collaborator (method/function contract).
- Verify optional collaborators are optional only when explicitly declared optional.

Prefer tests shaped as payload/response flow assertions:
- input payload -> guard call payload
- guard result -> normalizer call payload
- normalizer result -> outlook call payload
- composed output -> API response payload

## TDD for Composition
When TDD is requested:
1. RED: add one wiring test for one flow edge.
2. GREEN: minimal wiring/mapping change for that edge.
3. No concrete implementation added in composition during GREEN.

## Review Checklist
- Composition contains no domain logic.
- All collaborators are interfaces with explicit shape checks.
- No hidden default implementations.
- No inline fake/stub business behavior in assemblers/wiring.
- Environment-specific providers are explicitly separated and mode-gated.
- Tests prove payload/response chaining with spies.
- Tests cover short-circuit and error/validation paths.
- Final assembler wires adapters outside wiring tests.
