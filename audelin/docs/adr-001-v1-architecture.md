---
date: 2026-10-21
model: claude-opus-5-5
description: "Every component speaks its own terms and knows nothing outside them; edges live in adapters, and a composition root alone wires them"
---

# ADR-001 — Components in their own terms, composed at the root

## Executive summary

Every component is written in its own terms and knows nothing outside them:
it declares the collaborators it needs as interfaces it owns, and never
imports another component, its types, or the file system, audio devices and
models it ultimately runs on. Those live only in adapters at the edges, and
a composition root alone decides what answers each interface. This keeps
each component's reason to change its own, and lets each be tested alone
with fakes.

## Context

Audelin's logic (when a recording may start, what to do when a side is
lost, how live text settles) sits among things that change for unrelated
reasons: the layout and formats of files on disk, the audio APIs, the
recognition model, the UI toolkit. A component that knows any of them
changes when they do, re-proves them in its tests, and cannot be tested
without them. Two components that share a type change together whenever
either needs that type to change.

| Alternative | Why not |
|---|---|
| One module | Nothing stops any code reaching into any other code or into the edges; nothing is testable alone. |
| A shared domain module for what components have in common | Every component then speaks the shared vocabulary instead of its own, and the module gathers whatever two components touch: file formats, folder names, locks. |
| A shared module of interfaces, one per adapter | Interfaces follow the adapters' seams instead of what each consumer needs, and every consumer of one changes with it. |

## Decision

1. **A component speaks its own language.** It declares its own types and
   the interfaces of the collaborators it needs, cut by the role each plays
   for it and named for what it needs, not for a mechanism. Two components
   with similar types each keep their own.
2. **Collaborators are given, never reached.** A component receives every
   collaborator it needs when it is built, as its own interfaces. It never
   imports its consumers, its collaborators' implementations or their types.
   Another component's need, rule or data reaches it only through one of its
   interfaces.
3. **Edges live in adapters.** The file system, file formats, audio devices,
   recognition models, the OS and the UI toolkit are known only to the
   adapters that wrap them; a component's UI is its adapter to the UI
   toolkit. Each file format has one reader and one writer, and no other
   component knows there is a file.
4. **The composition root decides.** It alone knows the concrete components
   and adapters, builds them, and plugs an answer into each interface,
   translating between components' types. When two components need one
   answer, such as one recording excluding a move of the calls folder, the
   root provides it to both.
5. **Cross-cutting concerns are decorators at the root.** Logging, and any
   later metrics, retries or caching, wrap a component's interfaces at the
   composition root. No component logs or knows it is observed.

## Rules / invariants

1. A component MUST NOT import another component, its implementations or
   its types.
2. A component's interfaces MUST belong to the component itself and express
   exactly what it needs of the collaborator; an interface MUST NOT be
   shared by two components.
3. A component MUST receive its required collaborators at construction and
   MUST be valid once built.
4. Only adapters MAY use the file system, a file format, audio devices,
   recognition models, the OS or the UI toolkit; a UI is an adapter. Each
   file format MUST have exactly one reader and one writer.
5. Each rule (what makes a call folder valid, when a recording may start)
   MUST have one owner; others MUST be handed it through an interface,
   never re-implement it.
6. Only the composition root MAY know concrete components and adapters,
   build them, and translate between their types.
7. Logging and other cross-cutting concerns MUST be decorators at the
   composition root; no component MAY log.
8. Every component MUST be testable alone, with fakes of its own interfaces.

## Consequences

- Each component changes only for its own reason, and its tests need no
  disk, device or model.
- Similar types exist in several components, and the composition root
  translates between them. The cost is the translation code and its tests.
- The composition root grows with every component; it holds no logic of
  its own beyond wiring, translation and decorators.
- Swapping an edge (a file format, the audio API, the model) changes one
  adapter and its wiring.
- A path where translation copies too much to keep up, such as captured
  audio, would break this decision; the decision then needs an amendment
  naming the shared type and why.

## Non-goals

- What the app does: [mvp.md](mvp.md) and the specs.
- How many processes the app runs.
