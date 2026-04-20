---
name: executable-spec-scaffolding
version: "1.0.0"
author: Igor Malyarov
description: Use when drafting executable specifications for service, orchestrator, or collaborator-heavy components where responsibility boundaries, shared orchestration, and collaborator contracts must be made explicit before implementation.
---

# Executable Specification Scaffolding

Draft executable specifications that guide implementations through clear actor responsibilities, explicit collaborator contracts, shared orchestration boundaries, and minimal duplication.

## When to Use

Use this skill when:

- the component is built around services, orchestrators, pipelines, guards, repositories, or similar collaborators
- the main risk is unclear responsibility boundaries rather than UI detail
- you need tests that assert contracts and payloads, not just downstream effects

Do not use this as a generic spec-writing checklist for every feature. It is most useful when orchestration, delegation, sequencing, and collaborator contracts are the load-bearing design concerns.

## Purpose

Use this as a drafting and review checklist for executable specs that should stay flexible under future iteration while remaining explicit about responsibilities and guarantees.

## Core Principles
- **Stateless service surfaces**: Entry points should coordinate collaborators but not own long-term state. Any history or caching belongs to explicit dependencies.
- **Explicit collaborator contracts**: Specifications must spell out what data each collaborator expects (payload shape, sequencing guarantees) rather than asserting outcomes the service cannot enforce alone.
- **Shared policy extraction**: When multiple use cases share orchestration, extract a reusable coordinator/spec (e.g., orchestrator, pipeline, policy engine) so per-use-case specs focus on differentiators.
- **Prefer async-capable contracts when future async boundaries are likely**: If the component is likely to cross network, storage, or other asynchronous boundaries later, prefer `async throws` (or equivalent) in the executable spec even if current collaborators are synchronous. If the domain is genuinely synchronous, keep the contract synchronous.
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
- [ ] Async contract choice documented; tests remain deterministic via controlled stubs.
- [ ] Idempotency/replay requirements expressed as collaborator contracts, not implicit service memory.
- [ ] Duplication audit performed—no scenario is asserted in multiple suites without purpose.
- [ ] Guard failure paths covered (propagation, translation if required).
- [ ] Success flow verified end-to-end once per shared component, not per service.

Keep this document close when drafting or reviewing executable specifications to maintain clarity, flexibility, and cohesion across future iterations.
