---
title: Informal Brief
date: 2026-05-04
author: Igor Malyarov
description: "Personal-voice companion to the formal My Way docs — the punchlines, not the mechanics."
format: note
---

# My Way — Informal Brief

This is the short, personal-voice version. The mechanics live in [pre-coding-phase.md](pre-coding-phase.md) and [coding-phase.md](coding-phase.md); this note is the part that is hard to write into a structure document — the intuitions, the punchlines, the things I would say over coffee instead of in a spec.

## The whole shape, in three lines

1. **Intent** — just user stories, made first-class.
2. **Research** — pick goals for the investigation (hypotheses, prior art, unknowns, trade-offs); send different agents in different sessions so focus does not dilute.
3. **Look at all of it** — synthesis is its own step, not an afterthought.

Everything past that — pre-ADR, ADR, spec, plan, code, tests — is mechanical compared to those three. The hard part is the front.

## Intent is the hard part

Honestly: intent is by far the hardest part. Everything downstream is many times easier. If a project feels stuck and you cannot tell why, the answer is almost always "intent is not actually settled yet."

If you cannot formulate intent in one or two sittings, that is the signal — not a failure.

## When intent is stuck: brainstorm with a harness

Run a few brainstorming sessions. Before each one, send an agent (or two) to pull a quick summary of best practices on the topic, and **save the prompt** — that prompt is the harness.

The harness matters. LLMs love delivering results; they are terrible at the open-ended *inventing* process. Without a harness they collapse into "here is a polished answer to the wrong question" within two turns. With a harness — explicit goals, prior art loaded, ground rules — they are decent collaborators.

## Pruning user stories

If the story list is too long, sit with an agent and pick about 7 (the 5±2 / 7±2 range — what fits in a head at once). The rest go to backlog, not to the bin.

Make the agent **explain its prioritization**. Do not accept "these feel important." If it writes nonsense, push back hard and make it justify again. The justification is the deliverable; the ranked list is a side effect.

## Why downstream must bend to intent, not the other way

The Product Intent layer says: **the user promise that downstream artifacts must preserve**. In practice that means:

- An ADR cannot contradict the intent. If it does, the ADR is wrong — not the intent.
- If you change the intent, you fix everything downstream that depends on it, and you rewrite the product to match.

This is the whole reason intent gets a parent layer above ADR. Without the rule, downstream artifacts quietly redefine the product, and nobody notices until the user-facing thing does not match what was promised.

## What the formal docs add

The formal docs add the layers between intent and execution (research → pre-ADR → ADR → spec → plan), the loop discipline (revisit upward when reality pushes back), and the back half (executable spec → TDD → log → artifact). All of that is real and load-bearing.

But the front of the loop is where the work either succeeds or quietly fails. Spend the time there.
