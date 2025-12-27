---
date: 2025-10-21
model: codex
description: "Working notes for executable specification scaffolding and responsibility-focused tests."
---

# Executable Specification Scaffolding — Working Notes

## Purpose
Summarize reusable insights for designing executable specifications that guide implementations with clear responsibility boundaries, minimal duplication, and future-flexible contracts. Use this as a checklist when spinning up new specs, regardless of domain.

## Core Principles
- **Stateless service surfaces**: Entry points should coordinate collaborators but not own long-term state. Any history or caching belongs to explicit dependencies.
- **Explicit collaborator contracts**: Specifications must spell out what data each collaborator expects (payload shape, sequencing guarantees) rather than asserting outcomes the service cannot enforce alone.
- **Shared policy extraction**: When multiple use cases share orchestration, extract a reusable coordinator/spec (e.g., orchestrator, pipeline, policy engine) so per-use-case specs focus on differentiators.
- **Async-by-default contracts**: Declare operations as `async throws` (or equivalent) even if current collaborators are synchronous. This future-proofs the spec while allowing deterministic tests through synchronous stubs.
- **Test names as executable statements**: Phrase scenarios in terms of observable contracts (“should pass fingerprint with …”, “should propagate guard error”) rather than internal assumptions.

## Responsibility Modeling
1. **Identify actors**  
   - Orchestrators/pipelines that enforce sequencing and cross-cutting concerns.  
   - Stateless services or controllers that gather inputs and delegate.  
   - State-bearing collaborators (caches, repositories, guards) responsible for persistence, deduplication, etc.  
   - Domain logic that must remain isolated from infrastructure/policies.
2. **Assign guarantees**  
   - What each actor promises (e.g., “orchestrator commits/rolls back transaction”, “guard decides replay vs mismatch”).  
   - What each actor must never assume (e.g., stateless service cannot rely on hidden memory).  
   - Data handed off between actors (fingerprints, commands, events).
3. **Reflect guarantees in specs**  
   - Shared guarantees live in shared suites (orchestrator/policy tests).  
   - Operation-specific suites verify only their unique responsibilities and collaborator payloads.

## Specification Patterns
- **Collaborator payload tests**: Assert the exact payload/parameters passed to collaborators rather than downstream side effects that occur outside the component’s control.
- **Delegation assertions**: Verify services call shared orchestrators/pipelines instead of reimplementing flows.
- **Error propagation**: Tests should confirm that components surface collaborator failures unchanged unless transformation is part of the contract.
- **Sequencing checks**: Place ordering/idempotency/transaction sequencing tests in the shared component spec once; avoid rechecking in each service spec.
- **Configuration injection**: When services inject configuration (currency, TTL, guardrails), tests describe that contract explicitly to prevent hidden defaults.

## Design Heuristics
- Prefer Template Method or pipeline builders for shared orchestration; inject operation-specific closures/delegates.
- Keep helper seams small and intention-revealing, so the primary flow reads as a narrative.
- Record side-effect markers (logging, metrics, events) in one place to keep specs and implementations aligned.
- Normalize naming conventions (`shouldPassFingerprint_with…`, `shouldSurface…Error`) to make specs searchable and composable.

## Checklist for New Specs
- [ ] Responsibilities diagrammed with stateless vs stateful actors identified.
- [ ] Shared orchestration extracted into its own executable spec.
- [ ] Service-level specs focus on collaborator payloads, configuration injection, and delegation.
- [ ] Async contract documented; tests remain deterministic via controlled stubs.
- [ ] Idempotency/replay requirements expressed as collaborator contracts, not implicit service memory.
- [ ] Duplication audit performed—no scenario is asserted in multiple suites without purpose.
- [ ] Guard failure paths covered (propagation, translation if required).
- [ ] Success flow verified end-to-end once per shared component, not per service.

Keep this document close when drafting or reviewing executable specifications to maintain clarity, flexibility, and cohesion across future iterations.
