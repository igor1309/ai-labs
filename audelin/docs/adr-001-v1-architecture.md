---
date: 2026-10-21
model: claude-opus-5-5
description: "Audelin v1 is one app built from small modules: ports and adapters, wired only by the composition root"
---

# ADR-001 — One modular app for v1

## Executive summary

Audelin v1 is one native macOS app process. Its code is small modules:
features split into a Core and a UI, pure Domain logic, and adapters for
everything external. A Core declares the ports it needs; the composition
root in the app target alone creates adapters and decides what plugs into
each port. Modules never log; the composition root logs their public
interfaces through decorators.

## Context

The owner asked for one app that is highly modular, following the layout of
their iFora `swift-vortex` package ([mvp.md](mvp.md) § Code structure).
What the app does is [mvp.md](mvp.md)'s and the specs'.

| Alternative | Why not |
|---|---|
| Separate recorder process plus a UI app, as Verger's service | Would keep recording through a UI crash, but adds a second process to supervise and an IPC contract before either is needed; the CLI is a Later item. Revisit if app crashes during calls are seen. |
| One target | Nothing stops a feature reaching into another or into the file system and audio devices, and nothing is testable alone. |
| A domain module for what features have in common | Each feature then speaks a shared vocabulary instead of its own, and the module gathers whatever two features touch: file formats, folder names, locks. |

## Decision

1. **One app process.** If the app crashes, everything in it stops.
2. **Modules by role.** A feature is a Core (its logic, Foundation only) and
   a UI. A Domain module holds pure logic that stands on its own; nothing
   goes into Domain because two features need it. An adapter wraps one
   external thing.
3. **Ports and adapters.** A Core declares, in its own terms, the ports it
   needs for everything outside it, other features included. Adapters
   implement ports. Features never know each other.
4. **The composition root decides.** Only the app target creates adapters
   and decides what plugs into each port, including when one answer serves
   two features.
5. **Logging is a decorator in the composition root** (owner, 2026-10-21).
   Only public interfaces are logged: the ports and each module's public
   API. The composition root wraps them in decorators that implement the
   same interface and log calls, results, errors and durations before
   passing them on. No module logs or knows it is being logged.

## Rules / invariants

Module dependencies (production targets; a test target MAY depend on its
subject, the modules its subject depends on, and test frameworks):

1. Domain MUST NOT depend on any other module of ours.
2. A feature Core MAY depend on Domain only; a UI target MAY depend on its
   own Core and Domain only.
3. An adapter MAY depend on Domain and on the Core whose ports it
   implements; adapters MUST NOT depend on each other.
4. Only the app target MAY depend on every module and create adapters.
5. Every production target MUST have a test target.

Apple and third-party frameworks:

6. Domain and Core targets MUST use Foundation only.
7. UI targets MAY use AppKit and SwiftUI; adapters MAY use what they wrap.

Logging:

8. Logging MUST happen only in decorators in the composition root, and only
   on public interfaces; no module MAY log.

## Consequences

- Each module is testable alone.
- More targets and protocols than a single-target app; accepted for the
  owner's modularity requirement.
- Two features that need the same answer each declare a port, and the
  composition root wires one answer to both.
- Every call across a public interface can be traced without touching
  module code. What happens inside a module shows only through the calls it
  makes. The cost is one decorator to keep in step with each interface.

## Non-goals

- A background service, CLI or agent access in v1.
- What the app does and how each module does it: [mvp.md](mvp.md) and the
  specs.
