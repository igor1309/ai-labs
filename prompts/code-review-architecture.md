---
date: 2026-09-23
author: Igor Malyarov
model: gpt-6
name: Code review — architecture
version: 0.0.3
type: prompt
---

Architecture Review

Review the codebase for maintainability, change isolation, clear ownership, dependency direction, composition, and SOLID design quality.

Use architectural judgment. Treat the architectural invariants below as authoritative; use the Go-specific section to interpret how they should appear in Go.

The recorded decisions (ADRs) are given. Code that departs from one is a finding: quote both. Do not review the decisions themselves.

Architectural invariants

* A module represents a cohesive capability and owns its internal implementation.
* Modules interact through explicit, narrow module APIs.
* Each component/subcomponent owns its domain types and dependency types.
* Components declare their own types even when another component has structurally similar types.
* Boundary adapters translate between independently owned types.
* A component never imports its consumers or their types; the composition root adapts its API to theirs.
* A component never imports the implementations of its collaborators or their types; the composition root adapts them to its own dependency contracts.
* Adapters between components are thin, live in the composition root, depend on interfaces rather than concrete types, and are tested there.
* Interfaces belong to the consuming component/subcomponent and express exactly the collaborator capabilities it requires.
* A component's interfaces are cut by the roles its collaborators play for it, not by the seams of existing adapters or former shared interfaces. Signs of the latter: one interface per existing adapter or former shared interface, renamed; names that describe a mechanism rather than what the component needs; two interfaces always satisfied by one adapter and used together; one interface bundling unrelated needs because one adapter provides them.
* A component that calls one collaborator only to pass the response to another, and uses neither otherwise, or receives collaborators only to hand them to another component, with no role of its own in the hand-off (ordering, consistency, translation, policy), has the wrong interfaces and the wrong responsibility: the two calls are one role, and the hand-off belongs to a collaborator.
* Required dependencies are explicit and supplied during construction.
* Construction produces a valid component with its required collaborators present.
* The application composition root assembles modules.
* Each module has a local composition root that assembles its internal components and exposes the module API.
* Infrastructure implementations are attached to consumer-defined dependency contracts at composition roots.
* Cross-cutting concerns such as logging, metrics, tracing, retries, caching, and instrumentation are composed through decorators at composition-root nodes.
* Adapters and decorators can be reusable when their semantics and ownership boundaries genuinely align.
* SOLID principles are design heuristics for examining responsibility, cohesion, coupling, interface design, substitutability, and dependency direction.
* Abstraction follows architectural boundaries and collaborator roles rather than code-shape similarity or reuse opportunities.

Go-specific interpretation

* A module will typically consist of a cohesive group of Go packages around one capability.
* Package structure should make architectural dependency direction visible.
* Implementation details remain unexported or live under internal.
* Exported identifiers form a deliberately small module surface.
* Module entrypoints expose the capabilities and data required by callers.
* Consumer interfaces are declared by the consuming component itself (its type or use case), not in a shared file or package of interfaces. An interface required by more than one component is a finding, even when they need the same capability; one adapter satisfying several components' interfaces is fine. A contract a module offers is not a required interface only where a recorded decision makes it one (ADR-001 rule 15, the client contract, which its decorators implement).
* Interface shape follows the consumer’s required capability; interface size follows naturally from that responsibility.
* Constructors such as NewX(...) receive all required dependencies explicitly.
* main acts as the application composition root and connects module APIs.
* Module construction functions act as local composition roots and hide internal wiring.
* Database implementations, external clients, queues, storage, clocks, and similar infrastructure are connected through adapters implementing consumer-owned interfaces.
* Boundary adapters perform translation between the caller’s types and the callee’s API types.
* An adapter inside a component's package that imports another component (the application core, its domain, an infrastructure module) to implement or call it is a finding: it belongs in main.
* Adapters in main are tested by main's tests with stand-ins for the interfaces they take. A test that keeps its own copy of an adapter is a finding.
* Decorators wrap specific collaborators or module entrypoints at wiring locations.
* Generic helpers, adapters, or decorators are appropriate when the abstraction represents the same semantic role across usages.

Definition of done

Architecture is in good shape when:

* A module can be understood through its API without knowing its internal package graph.
* A component’s collaborators are visible from its construction.
* A component can be tested in isolation by supplying implementations of its declared collaborator interfaces.
* Cross-module calls pass through explicit boundaries.
* Each side of a boundary retains ownership of its own types.
* Infrastructure choices can change through composition and adapters while the consuming component remains stable.
* Cross-cutting behavior can change at composition roots while core component behavior remains stable.
* Internal implementation changes normally remain contained within the owning module.
* Adding or replacing a collaborator produces a localized change around the relevant boundary and composition root.

Review findings

For each meaningful architectural issue, report:

1. Location — relevant package/component.
2. Invariant — architectural rule involved.
3. Evidence — concrete dependency, type ownership, wiring, or boundary structure observed.
4. Impact — how it affects isolation, coupling, ownership, testability, or change propagation.
5. Improvement — the smallest structural change that restores the intended boundary.

A change that extends an existing violation (a new user of a shared interface, a new method on a widened one) is a finding in the change, even though the violation predates it.

Prioritize architectural consequences over stylistic preferences.
