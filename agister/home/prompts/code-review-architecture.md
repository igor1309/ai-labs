---
date: 2026-10-12
author: Igor Malyarov
model: gpt-6
name: Code review — architecture
version: 0.0.11
type: prompt
---

Architecture Review

Review the shape of the change: the components it touches, what each owns, the direction of their dependencies, and how they are composed. Judge maintainability, change isolation, clear ownership and SOLID design quality by that shape. A finding is about structure, with behaviour, tests and documents as its evidence.

Use architectural judgment. Treat the architectural invariants below as authoritative; use the Go-specific section to interpret how they should appear in Go.

The recorded decisions (ADRs) are given as the rules the code keeps. Code that departs from one is a finding: quote both.

You do not run tests, vet or builds: every claim rests on the code, diff and history you read.

The lens

Read every component the change touches as it stands at the candidate, not only its lines in the diff: a dependency that predates the change is still how the change reached it. Review each by its responsibility, its dependencies (what it is given and what it imports) and its interfaces (what it offers and what it requires of its collaborators), and ask of each one question: what is its own reason to change? The goal, or a decision it carries out, is no component's reason to change: a component's reason is its own responsibility, and the question is what it had to know for the change to reach it. A change to how settings or records are kept (a document kind, a field, a file, a link between documents) is the reason of that file's reader and writer only; any other component it reached knew the file's words, even when the change only removes code. A component the change touched for another component's reason is a finding: name that reason and the dependency or interface that carried it in (a port, a shared type, a field passed on to be printed, a name spelled in a test).

Separation is judged by its language, not its form. A type a component declares is its own only when it speaks that component's words. Types of its own that carry another component's words (a file's kind, document, field, path or digest) are no boundary, and a finding. An adapter that copies fields one to one translates nothing: between internal components, two types of the same shape are a reason to look at what each component needs, and how different responsibilities came to the same shape. At the persistence edge such a copy is fine.

The file system and the concrete file formats are the language of the outer edges only. Each format is read by one reader and written by one writer, and no other component knows there is a file. A package that parses a format is an edge, whatever its path.

The width of the change is evidence. When one decision changes many components, account for each one by the responsibility it would have if no file existed.

Architectural invariants

* A module represents a cohesive capability and owns its internal implementation.
* Modules interact through explicit, narrow module APIs.
* Each component/subcomponent owns its domain types and dependency types.
* Components declare their own types even when another component has structurally similar types.
* Boundary adapters translate between independently owned types.
* A component never imports its consumers or their types; the composition root adapts its API to theirs.
* A component never imports the implementations of its collaborators or their types; the composition root adapts them to its own dependency contracts.
* Adapters between components are thin, belong to a composition root, depend on interfaces rather than concrete types, and are tested with it. A composition root is a role, not a place: main, or a package that builds a component from other components so main stays thin.
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
* Consumer interfaces are declared by the consuming component itself (its type or use case), not in a shared file or package of interfaces. An interface required by more than one component is a finding, even when they need the same capability; one adapter satisfying several components' interfaces is fine. A contract a module offers is not a required interface only where a recorded decision makes it one.
* Interface shape follows the consumer’s required capability; interface size follows naturally from that responsibility.
* Constructors such as NewX(...) receive all required dependencies explicitly.
* Package-level mutable state (a registry, cache, map or singleton that values reach without being given it) is a hidden collaborator and a finding, even when it looks like an implementation detail: instances share it implicitly and tests cannot isolate it. The composition root constructs it and passes it in.
* main acts as the application composition root and connects module APIs.
* Module construction functions act as local composition roots and hide internal wiring.
* Database implementations, external clients, queues, storage, clocks, and similar infrastructure are connected through adapters implementing consumer-owned interfaces.
* Boundary adapters perform translation between the caller’s types and the callee’s API types.
* An adapter inside a component's own package that imports another component (the application core, its domain, an infrastructure module) to implement or call it is a finding: it belongs to a composition root.
* Adapters are tested where their composition root is, with stand-ins for the interfaces they take. A test that keeps its own copy of an adapter is a finding.
* Decorators wrap specific collaborators or module entrypoints at wiring locations.
* Generic helpers, adapters, or decorators are appropriate when the abstraction represents the same semantic role across usages.

Definition of done

Architecture is in good shape when:

1. A module can be understood through its API without knowing its internal package graph.
2. A component’s collaborators are visible from its construction.
3. A component can be tested in isolation by supplying implementations of its declared collaborator interfaces.
4. Cross-module calls pass through explicit boundaries.
5. Each side of a boundary retains ownership of its own types.
6. Infrastructure choices can change through composition and adapters while the consuming component remains stable.
7. Cross-cutting behavior can change at composition roots while core component behavior remains stable.
8. Internal implementation changes normally remain contained within the owning module: every component the change touched had a reason of its own to change.
9. Adding or replacing a collaborator produces a localized change around the relevant boundary and composition root.

Report every numbered item of the definition of done in `coverage`, in order, as `item` "<number>. <short name>", with its status: `checked` (what was checked, briefly), `finding` (the finding numbers), `rule_only` (the rule, path:line, why no concrete case), or `not_checked` (why). An item that does not apply to the change is `checked` with "not applicable: <why>".

Review findings

For each meaningful architectural issue, report:

1. Location — relevant package/component.
2. Invariant — architectural rule involved.
3. Evidence — concrete dependency, type ownership, wiring, or boundary structure observed.
4. Impact — how it affects isolation, coupling, ownership, testability, or change propagation.
5. Improvement — the smallest structural change that restores the intended boundary.

Every finding presents its case for value before it is emitted: the `requirement` it violates, the `consequence` in its case, the `severity_rationale` (why this severity and not the one below), and the `fix_cost` as `review-result.json` bands it, each band with its basis.

A change that extends an existing violation (a new user of a shared interface, a new method on a widened one) is a finding in the change, even though the violation predates it.

You are given the goal of the change: what it is for. Look also for what stops the goal, in code the change did not touch too. Such a finding has scope `goal`: its case is a concrete scenario the goal requires, its trace shows how the defect stops that scenario's outcome, and its `requirement` quotes the goal's condition with every qualification it carries and says where in the goal it stands. The goal's claims about design or completeness ("not needed", "handled elsewhere") are claims you check. Its scope exclusions ("out of scope") stand: you may show that one stops the goal, quoting it in the finding, but you cannot override it.

Prioritize architectural consequences over stylistic preferences.
