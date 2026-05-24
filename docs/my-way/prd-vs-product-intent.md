---
title: PRD vs Product Intent
date: 2026-05-17
author: Igor Malyarov
description: "Framing note on why Product Intent is a narrow layer rather than a god-document PRD."
format: note
---

# PRD vs Product Intent

## God document vs narrow doc

A PRD is a **god document**: one umbrella holding product framing, personas, UX, functional and non-functional requirements, success metrics, scope, timeline, dependencies, and stakeholder sign-off. Everything downstream is expected to derive from it; it is the single throat to choke when something is unclear.

Product Intent goes the opposite way. It is **deliberately narrow** and owns only the part a god document is worst at keeping honest: what user-facing capability and outcome are we actually committing to. Architecture, behavior rules, sequencing, and tests are handed off to dedicated artifacts (ADR, spec, plan, code) with traceability back to the story.

## One place to look vs one thing per place

- **PRD** — one wide doc, low ceremony to start, high drift risk. UX details outdate product framing; tech notes outdate UX; the doc rots as a whole.
- **Product Intent** — narrow doc, higher chain ceremony, but each layer changes at its own cadence without invalidating the others. Impact review is bounded to the layer that actually changed.

PRD optimizes for **one place to look**. Product Intent optimizes for **one thing per place**.

## See also

- [00-product-intent/note.md](00-product-intent/note.md) — what Product Intent is and is not.
- [00-product-intent/structure.md](00-product-intent/structure.md) — mandatory structure.
- [elevator-pitch.md](elevator-pitch.md) — three-line distillation of the method.
