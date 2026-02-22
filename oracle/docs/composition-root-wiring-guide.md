---
date: 2026-02-22
model: gpt-5
description: "Composition root rules for interface-only wiring, layered assembly, environment wiring, and wiring tests"
---

# Composition Root Wiring Guide

## Purpose
Define how composition root code is created, assembled, and tested in this repo.

## Definition
Composition root is an architectural concept: the place(s) where the app is assembled from collaborating parts.

It is not required to be a single function, type, or module. It may be layered and cascaded across multiple composition files.

Composition root is not business logic.

## Core Rule
Composition wiring may:
- connect interfaces,
- map payload/response shapes between interfaces,
- choose implementations at assembly time (for example by environment/config),
- short-circuit on technical failures (validation/dependency/transport).

Composition wiring must not implement business decisions at runtime from domain payload semantics.

## What Is Allowed in Composition
- Dependency presence and shape validation.
- Call ordering across interfaces when it is mechanical orchestration.
- Payload adaptation from one interface to another.
- Response adaptation from one interface to another.
- Technical short-circuiting (validation/dependency/transport failures).
- Environment/config-based implementation selection in final assembly.
- Colocated adapters as composition implementation details (can be private).

## What Is Not Allowed in Composition
- Domain/business decisions based on runtime domain payload semantics.
- Concrete caching policy logic (keys, hit/miss policy, cache reads/writes) unless delegated to a collaborator.
- Normalization/derivation algorithms as composition behavior.
- Default placeholder implementations that hide missing wiring.
- Inline stub/fake behavior inside wiring composers or assemblers.
- Any implicit fallback to in-memory/demo behavior in production mode.

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
Use layered assembly as needed:

1. Wiring composer:
Creates a composed piece from interface dependencies.

2. Composition adapter layer (colocated):
Implements provider/module-to-interface mapping needed by the composer.
These are composition implementation details, not standalone adapter modules by default.

3. Final assembler:
Builds concrete instances, applies environment/config selection, plugs them into composers, and returns deployable entrypoints.

Extract standalone adapter modules only when they are generic and highly reusable.

## Environment-Specific Instance Policy
Environment-specific instances are allowed when explicitly separated and intentionally composed.

Rules:
- Environment-specific instances are concrete implementations of the same interface contract.
- They are not stubs/fakes.
- Final assembler may select instances by explicit mode/config.
- Production selection must be fail-closed (no implicit fallback).
- Production and non-production selections must be documented.
- Wiring tests assert interface contracts and orchestration, not provider internals.

## Stub/Fake Prohibitions (Hard)
- Do not embed deterministic fake business outputs in composition wiring.
- Do not use stubs/fakes as silent defaults for missing production dependencies.
- Do not allow test-only providers in production paths without explicit mode gating.
- Any component returning canned business outcomes in place of real collaborator behavior is treated as a stub/fake.

## Testing Composition Wiring
Use interface substitutions (spies/stubs/mocks) in wiring tests; avoid concrete infrastructure in composer tests.

Verify:
1. payload into first interface,
2. mapped payload into next interface,
3. mapped response out,
4. technical short-circuit paths,
5. required side effects,
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

Adapter testing rule:
- If adapter logic is private, test it indirectly through the composed public seam.
- If direct unit tests are required, keep adapter logic non-private (module-internal/test-visible) while still colocated in composition.

Final assembler testing rule:
- Add minimal integration/smoke tests for environment/config selection and fail-closed production wiring.

## TDD for Composition
When TDD is requested:
1. RED: add one wiring test for one flow edge.
2. GREEN: minimal wiring/mapping change for that edge.
3. No concrete implementation added in composition during GREEN.

## Review Checklist
- Composition contains no runtime business decision logic.
- Runtime branching in composition is only technical (validation/dependency/env/error plumbing).
- Collaborators are wired by interface contracts with explicit validation where required.
- No hidden default implementations.
- No inline fake/stub business behavior in assemblers/wiring.
- Environment-specific instances are explicit, mode-gated, and documented.
- Wiring tests prove payload/response chaining and technical short-circuits.
- Production wiring fails closed when required dependencies are missing.
