---
title: "Component Architecture Approach"
date: 2026-04-05
model: opus-4.6
version: 0.1.0
status: accepted
type: approach
---

# Component Architecture Approach

A reusable method for deriving the architecture of a separately deployed component. Applicable to any component in a system — frontend, backend, worker, CLI tool.

## Premise

Architecture work begins after product decisions are stable enough to build against. The input is a pre-ADR spec or equivalent — product-level decisions about what the system does, not how it's built. The architecture process must not revisit product decisions and must not leak implementation knowledge across component boundaries.

## Sequence

### 1. Identify the component boundary

Before discussing internals, establish what the component is and what it is not. A component is a separately built and deployed unit with its own composition root. It does not share a runtime with other components.

### 2. Define external operations from the component's perspective

Ask: what does this component know it can do? Not what the system does — what this component's vocabulary contains.

The key discipline is **staying inside the component's boundary**. If the component doesn't need to know about a concept, that concept doesn't appear in the contract — not as an endpoint, not as a field, not as a status code.

The test: if you find yourself explaining another component's internal concept to justify a contract decision, you've crossed the boundary.

### 3. Choose interface conventions

With operations identified, pick a convention (REST, RPC, message-based) and apply it consistently. The choice matters less than consistency. Lock the naming before moving on.

### 4. Lock the contract with a schema

The contract is not locked until it has a machine-readable schema (OpenAPI, protobuf, AsyncAPI, etc.). Directional agreement on operations is not a locked contract — it leaves types, status codes, error shapes, and auth requirements ambiguous.

Writing the schema forces decisions on every open question. These are not implementation details — they are the interface.

The schema is the artifact that a consumer can use to build a working client or conforming implementation without asking questions.

### 5. Define internal architecture

Only after the external contract is locked, move to internals. The contract constrains the internal design — not the other way around.

**Start with the state model.** What state does the component own? Enumerate it completely — this is the full state, nothing else.

**Identify the state transition model.** Sync transitions go through a reducer or equivalent — a pure function. Async transitions go through an effect handler or equivalent that dispatches results back into the sync path.

**Define collaborators as protocols.** The orchestration layer (effect handler, command handler, use case) depends on protocol-level collaborators. It doesn't know how they work — it calls them and handles results. This is the dependency inversion boundary between orchestration and implementation.

**Define services as protocol implementations.** Each collaborator protocol has a concrete implementation. Shared infrastructure dependencies (HTTP client, DB client, message bus) are shared for simplicity, not coupling — each service could use a different implementation if needed.

**Handle cross-cutting concerns via composition.** Auth, logging, tracing, error tracking — these are decorators or wrappers applied at the composition root. They conform to the same protocols they wrap. Consumers don't know they exist.

**Separate presentation from state.** Whatever renders output (UI, HTTP response serializer, CLI formatter) receives state and dispatches actions. It knows nothing about services, effects, or infrastructure.

### 6. Lock as ADR

The composition root wiring, the protocols, and the dependency graph are the architecture. Write them down in an ADR. Changes go through a new ADR version, not ad-hoc modification.

## Principles

**Client owns interfaces.** The consuming side of a boundary defines the contract it needs. The providing side conforms.

**Boundary discipline.** Every concept belongs to one side of a boundary. If the component doesn't need to know it, it doesn't appear in the component's vocabulary.

**External before internal.** Lock what the component looks like from outside before deciding how it works inside. The contract constrains the architecture, not the reverse.

**Schema before code.** A verbal agreement on operations is not a contract. The schema is the contract. Write it before writing any implementation.

**State machine as core.** The state/transition model owns all state. Everything else plugs into it. This makes behavior explicit, testable, and traceable.

**Composition root as the only wiring point.** No service locators, no singletons, no ambient state. Dependencies flow in one direction: from the root outward. Cross-cutting concerns are composed here, not scattered.