---
date: 2026-06-23
model: claude-opus-4-8
description: "Forward task: add a 'consume a dependency through its public contract' skill to the dev-skills boundary family."
version: 0.0.1
---

# Backlog — Dependency-consumption boundary skill

## Add a "consuming-a-dependency" skill (or section in composition-root)

The dev-skills boundary family covers *owning* and *wiring* boundaries
(`protocol-owned-by-client`, `composition-root`), but nothing covers *consuming*
another module or plugin through its public contract. The gap shows up when
building one component on top of another: it is easy to bind to the dependency's
**implementation** (install/cache paths, private CLI/argv, internal source)
instead of its **published entry points**.

Desired content — a short pre-flight to run before writing any integration code:

- Enumerate the dependency's public entry points and their invocability. For a
  Claude Code plugin that means: commands (note `disable-model-invocation`),
  model-invocable skills (note `user-invocable: false`), and agents.
- Bind to the narrowest public entry point that does the job.
- Stop signal: if you are globbing an install/cache path, or reading the
  dependency's source to learn how to call it, that is an implementation leak —
  back out and find the contract.

Decide placement: a new `consuming-a-dependency` skill vs. a section appended to
`composition-root`. Keep it complementary to `protocol-owned-by-client` (which
governs who *owns* a boundary) rather than overlapping it.
