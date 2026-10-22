---
date: 2026-10-21
model: claude-opus-5-5
description: "Every component speaks its own terms and knows nothing outside them; edges live in adapters, and a composition root alone wires them"
---

# ADR-001 — Components in their own terms, composed at the root

## Context

Audelin's features (recording, live text, the calls list, setup) use the
calls folder on disk, Core Audio, FluidAudio and its model, and AppKit,
each of which changes on its own. Every feature is built test-first, without
a disk, an audio device or a model.

## Decision

Every component is written in its own terms and knows nothing outside them.
It declares the collaborators it needs as interfaces it owns and receives
them when built. The edges live only in adapters, and a composition root
alone decides what answers each interface.

## Alternatives

| Alternative | Why not |
|---|---|
| One module | Any code can reach any other code and the edges; nothing is testable alone. |
| A shared domain module | Components speak its vocabulary instead of their own, and it gathers whatever two of them touch: formats, folder names, locks. |
| A shared module of interfaces | Interfaces follow adapters' seams, not consumers' needs, and every consumer changes with each one. |

## Rules / invariants

1. A component MUST NOT import another component, its implementations or
   its types; similar types are each component's own.
2. A component's interfaces MUST be its own, cut by the roles its
   collaborators play for it; an interface MUST NOT be shared by two
   components.
3. A component MUST receive its required collaborators at construction and
   MUST be valid once built.
4. Only adapters MAY use the file system, file formats, audio devices,
   recognition models, the OS or the UI toolkit; a UI is an adapter. Each
   file format MUST have one reader and one writer.
5. Each rule MUST have one owner; others MUST be handed it through an
   interface, never re-implement it.
6. Only the composition root MAY know concrete components and adapters,
   build them, and translate between their types.
7. Logging and other cross-cutting concerns MUST be decorators at the
   composition root; no component MAY log.
8. Every component MUST be testable alone, with fakes of its own interfaces.

## Consequences

- The composition root translates between similar types and grows with
  every component.
- A path where translation copies too much, such as captured audio, breaks
  this decision; it then needs an amendment naming the shared type.

## Non-goals

- What the app does: [mvp.md](mvp.md) and the specs.
- How many processes the app runs.
