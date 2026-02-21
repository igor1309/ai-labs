---
date: 2026-02-21
model: gpt-5.2
description: "Composition root rules for interface-only wiring, layered assembly, and wiring tests"
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

## Testing Composition Wiring
Wiring tests use spies only, not concrete infrastructure.

Verify chain correctness:
1. payload into first interface,
2. mapped payload into next interface,
3. mapped response out,
4. short-circuit paths,
5. required side effects (for example counters),
6. dependency validation failures.

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
- Tests prove payload/response chaining with spies.
- Tests cover short-circuit and error/validation paths.
- Final assembler wires adapters outside wiring tests.
