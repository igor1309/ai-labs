---
title: XP Roots
date: 2026-06-12
author: Igor Malyarov
description: "Lineage note — Extreme Programming as the formative and ongoing influence behind My Way: what carries over directly, what is transformed for agentic development, and where the method deliberately diverges."
format: note
---

# XP Roots

Much of the thinking and experience behind My Way was shaped by Extreme Programming, and continues to be. The method docs never said so — this note fixes that. It is not a claim that My Way *is* XP; it is an acknowledgment that XP is the tradition the method grew out of, the lens new practices still get checked against, and the source of several pieces that survived intact.

## What carries over directly

- **User stories as the entry point.** The [elevator pitch](../elevator-pitch.md) begins with "User Stories =>". Product Intent makes accepted user stories first-class and treats them as the promise downstream artifacts must preserve. That is XP's user-story practice, promoted to a governing parent layer rather than a planning input.
- **Test-first as the execution engine.** The [TDD cycle](../coding-phase.md) is XP's heartbeat unchanged: write a failing test, make it pass with the minimum change, refactor. Even the definition of done — a spec with test names — is XP's acceptance-test idea: the customer-visible criteria expressed as tests before the code exists.
- **Small steps, commit on green, continuous integration.** Implementation plans require mandatory test runs per step and commits only on green; every change goes through CI gates on a PR. This is XP's small-releases-and-CI discipline applied at the granularity of a plan step.
- **Feedback as the core value.** "Every `=>` is a loop: create artifact, review, pass gate, fix or step back." That is XP's feedback value generalized from code to every artifact layer — research, ADR, spec, plan, code all get pressure-tested and may send the work back upward.
- **Courage.** Stepping back to an earlier layer when reality pushes back is treated as part of the method, not a failure of it. That framing is XP's courage value, stated almost verbatim.
- **Spikes.** The Research layer is the spike solution repurposed: time-boxed, directed exploration whose output is understanding rather than commitment, explicitly allowed to be discarded.

## What is transformed for agentic development

- **Pair programming → human–agent pairing.** The pair is now a human and an AI assistant. Rotating models (GPT, Claude, and others) across stages and review cycles plays the role pair rotation played in XP: reducing the blind spots inherent to any single point of view.
- **On-site customer → Product Intent as artifact.** XP could keep the customer's voice in the room. Agents have no room to sit in and no memory across sessions, so the customer's voice becomes a first-class written artifact that downstream work must preserve — the Product Intent layer is the on-site customer made durable and legible to agents.
- **Oral communication → committed artifacts.** XP's communication value assumed a co-present team with shared tribal memory. With agents, communication must be version-controlled: research notes, pre-ADRs, ADRs, specs, and plans are committed alongside the code precisely because chat logs are where context goes to die.

## Where the method deliberately diverges

- **The weight of the pre-coding phase.** XP says the code is the design and distrusts big design up front. My Way deliberately runs a heavier [pre-coding funnel](../pre-coding-phase.md): intent → research → pre-ADR → ADR → spec → plan. This is not a rejection of XP's insight but a recalibration for a changed team. When the implementer is an agent that can discover-by-coding at machine speed, ambiguity is amplified rather than absorbed — coding too early no longer produces cheap learning, it produces confident wrong code in volume. The values are kept (feedback, small steps, working software as ground truth); the dial moves toward explicit upfront intent because the cost structure of "just start coding" changed.
- **Progressive formality instead of minimal formality.** XP kept artifacts deliberately light because the team's shared understanding carried the design. Here the artifacts *are* the shared understanding, so the method tolerates — and gates on — more written commitment than XP would, while still separating exploratory documents (allowed to be imperfect) from committed ones.

## A living influence, not a historical footnote

The influence is ongoing, not archival. When a new practice is added to My Way, the XP instincts are the first review pass: does it shorten a feedback loop or lengthen one? Does it add ceremony or add a gate that catches something real? Where My Way drifts from XP, the drift should be explainable the way the divergences above are — by what changed in the team, not by forgetting why the original practice existed.
