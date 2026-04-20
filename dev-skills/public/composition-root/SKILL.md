---
name: composition-root
version: "1.0.0"
description: Composition root wiring rules — interface-only boundaries, layered assembly, naming discipline, and wiring tests
trigger: when creating or modifying composition root code, assemblers, wiring, or adapters
---

# Composition Root Wiring Guide

## Purpose
Define how composition root code is created, assembled, and tested.

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
- Provider configuration data needed to instantiate an adapter (for example model IDs, prompt templates/system prompts, response schema enforcement rules, timeouts).

## What Is Not Allowed in Composition
- Domain/business decisions based on runtime domain payload semantics.
- Concrete caching policy logic (keys, hit/miss policy, cache reads/writes) unless delegated to a collaborator.
- Normalization/derivation algorithms as composition behavior.
- Prompt selection logic based on runtime domain payload semantics (prompt selection must be config/version based, not request-content based).
- Default placeholder implementations that hide missing wiring.
- Inline stub/fake behavior inside wiring composers or assemblers.
- Any implicit fallback to in-memory/demo behavior in production mode.

## Naming Discipline

Name adapters by protocol or capability, not by what they currently connect to.

The adapter's identity is the protocol it speaks (e.g., "OpenAI-compatible HTTP LLM client"). What sits behind the URL — a vendor, a proxy, a mock — is configuration, not identity.

Rules:
- File names, exports, and internal function names must describe the adapter's protocol, not a specific service.
- Error messages must be role-based ("LLM request timed out"), not service-branded ("OpenRouter request timed out").
- Environment variable names must be role-based (`LLM_API_KEY`), not service-branded (`OPENROUTER_API_KEY`).
- Litmus test: can you switch the service by changing only config values (URLs, credentials) without renaming any files, functions, or env vars? If not, service identity has leaked into code identity.

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
Adapters exist to connect mismatched collaborator contracts/types so the assembler can plug concrete instances into composer interfaces.
These are composition implementation details, not standalone adapter modules by default.

3. Final assembler:
Builds concrete instances, applies environment/config selection, plugs them into composers, and returns deployable entrypoints.

Extract standalone adapter code only for generic, abstract, reusable composition machinery shared by multiple composers/assemblers; otherwise keep adapters colocated as composition implementation details.

## Environment-Specific Instance Policy
Environment-specific instances are allowed when explicitly separated and intentionally composed.

Rules:
- Environment-specific instances are concrete implementations of the same interface contract.
- They are not stubs/fakes.
- Final assembler may select instances by explicit mode/config.
- Production selection must be fail-closed (no implicit fallback).
- Production and non-production selections must be documented.
- Wiring tests assert interface contracts and orchestration, not provider internals.
- Deterministic non-production doubles must be wired through a separate non-production composition entrypoint/harness, not through the production assembler path.

## Stub/Fake Prohibitions (Hard)
- Do not embed deterministic fake business outputs in composition wiring.
- Do not use stubs/fakes as silent defaults for missing production dependencies.
- Do not allow test-only providers in production paths without explicit mode gating.
- Any component returning canned business outcomes in place of real collaborator behavior is treated as a stub/fake.
- Production assemblers must not instantiate deterministic fake providers that return canned business outcomes.

## Testing Composition Wiring
Use interface substitutions (spies/stubs/mocks) in wiring tests; avoid concrete infrastructure in composer tests.
These test substitutions are test-only and are not runtime composition implementations.

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

## Review Checklist
- Composition contains no runtime business decision logic.
- Runtime branching in composition is only technical (validation/dependency/env/error plumbing).
- Collaborators are wired by interface contracts with explicit validation where required.
- No hidden default implementations.
- No inline fake/stub business behavior in assemblers/wiring.
- Environment-specific instances are explicit, mode-gated, and documented.
- Wiring tests prove payload/response chaining and technical short-circuits.
- Production wiring fails closed when required dependencies are missing.
