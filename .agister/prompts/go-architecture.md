---
date: 2026-10-05
author: Igor Malyarov
model: claude-opus-5-5
name: Go — architecture
version: 0.0.1
type: prompt
---

Applies to Go: a change that adds or moves a package, a type that
collaborates with another, an interface, a constructor or wiring. Skip it
for anything else, and for a change inside one function.

Write the code so that a change stays where it belongs: each component is
understood from its API, shows its collaborators in its construction, and
is tested alone with stand-ins for them. Where the repository records a
decision that differs from a rule below, the decision wins.

Interfaces belong to the consumer

* A component declares the interfaces it requires, beside itself (its
  type or use case), with only the methods it calls. Never in a shared
  file or package of interfaces.
* No interface is required by two components, even when both need the
  same capability: each declares its own, and one adapter may satisfy
  several. A shared interface grows with every user, and each user then
  depends on methods it never calls.
* Cut an interface by the role the collaborator plays for this component,
  not by the adapter that exists. Signs of the wrong cut: one interface
  per adapter, named after a mechanism instead of a need; two interfaces
  always satisfied by one adapter and always used together; one interface
  bundling unrelated needs because one adapter has them all.
* A component that calls one collaborator only to hand the answer to
  another, and adds no ordering, consistency, translation or policy of its
  own, has the wrong interfaces: the two calls are one role, and the
  hand-off belongs to a collaborator.
* A contract a module offers its callers, which its decorators implement,
  is shared only where a recorded decision says so.
* Do not extend a violation that is already there: a new user of a shared
  interface or a new method on a widened one is part of your change.

Types are owned on each side of a boundary

* A component declares its own domain types and the types its interfaces
  speak in, even when another component has the same fields. Shared types
  couple two components through every later change to either.
* A component imports neither its consumers nor the implementations of
  its collaborators, nor their types.
* A boundary adapter translates between the caller's types and the
  callee's. An adapter that imports another component to implement or call
  it does not live in a component's own package: it belongs to a
  composition root.
* Implementation details stay unexported or under `internal`. The exported
  names are a small, deliberate surface.

A thin composition root

* Only a composition root creates concrete implementations and connects
  them: `main` for the application, and a module's construction function
  for its internals, so that `main` stays thin. Everything else receives
  what it uses.
* The composition root owns the adapters between components. They are
  thin, take interfaces instead of concrete types, and are tested where
  the root is, with stand-ins for what they take. A test never keeps its
  own copy of an adapter.
* Infrastructure (databases, external clients, processes, storage, clocks)
  is attached there, through adapters that implement the consumer's
  interfaces. The core neither discovers nor creates it.
* Logging, metrics, tracing, retries and caching are decorators the
  composition root wraps around a collaborator or a module entrypoint.
  They change no argument, result or error, and the component they wrap
  does not know them.
* Share a helper, adapter or decorator only where it plays the same role
  in each use, not because the code looks alike.

Dependencies are given at construction

* `NewX(...)` receives every required collaborator explicitly and returns
  a component that is valid as built. A missing one fails there; nothing
  falls back to a real implementation.
* A component that only inspects gets nothing that starts or writes:
  what it can do is visible from what it was given.

No package-level mutable state

* A registry, cache, map or singleton that values reach without being
  given it is a hidden collaborator, even as an implementation detail:
  instances share it silently and tests cannot isolate it. The composition
  root constructs it and passes it in.

Keep the dependency rules by a test

* State which package may import which as a test over the real import
  graph (`go list -f '{{.ImportPath}} {{join .Imports " "}}' ./...`). For
  example: the domain imports nothing of the module but itself, the core
  only the domain, an adapter never another adapter, and only the
  composition root imports adapters. An edge outside the rules fails the
  test. A rule kept only in prose is lost with the first convenient
  import.
* Keep the interface rules the same way, over the syntax: no interface in
  a file of shared data, none named outside the file that declares it.
* A new package gets its place in that test in the change that adds it.

Done when

* A component's collaborators are visible from its construction, and it
  is tested alone by supplying implementations of its own interfaces.
* Replacing a collaborator or an infrastructure choice changes its adapter
  and the composition root, and nothing in the consumer.
* An internal change stays inside the module that owns it.
