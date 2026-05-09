---
title: My Way — Elevator Pitch
date: 2026-05-09
author: Igor Malyarov
description: "Three-line distillation of the method for verbal explanation. The mechanics live in pre-coding-phase.md and coding-phase.md."
format: note
---

# My Way — Elevator Pitch

Three lines, for explaining over coffee:

> User Stories => ADR => Spec w/ test names (definition of done) => Implementation Plan => Code Changes
>
> Every `=>` is a loop: create artifact, review, pass gate, fix or step back.
>
> Completion: archive Spec & Implementation Plan.

## Notes for the listener

- "User Stories" is the visible entry to **Product Intent**; Research and Pre-ADR are implied steps on the way to ADR.
- "Code Changes" stands in for Executable Spec → TDD → Log → Artifact.
- The loop is genuinely a loop: stepping back to any earlier layer when reality pushes back is part of the method, not a failure of it.
- Lite paths exist for minor features and bug fixes, with explicit escalation rules into the full sequence.

For the mechanics, see [pre-coding-phase.md](pre-coding-phase.md) and [coding-phase.md](coding-phase.md). For the punchlines, see [informal-brief.md](informal-brief.md).
