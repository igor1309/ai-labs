---
name: product-intent-review
description: Use when a Product Intent artifact needs review for story centrality, actor/outcome clarity, acceptance signals, boundaries, traceability, or downstream change-impact discipline.
---

# Product Intent Review

## Overview

Use this skill to review whether a Product Intent artifact can govern downstream My Way work without drifting into vision, PRD, backlog, architecture, spec, or implementation-plan responsibilities.

The goal is not prose polish. The goal is to test whether accepted user intent is explicit, story-centered, and traceable enough for downstream artifacts to preserve.

## Trigger

This skill applies when:

- a drafted Product Intent artifact needs review before downstream work depends on it
- user stories may be too vague, non-standard, or buried
- actors, outcomes, acceptance signals, or boundaries are unclear
- traceability to downstream artifacts is missing or excessive
- a change to accepted user intent may require impact review

Do not use this skill to review architecture, behavior rules, implementation slices, or test code except insofar as they expose Product Intent gaps.

## Inspect Before Acting

Read the Product Intent artifact first, then pull only the context needed to test it:

- the request or product problem it claims to address
- existing Product Intent artifacts in the same area
- downstream research, ADR, spec, or plan references named by the artifact
- the Product Intent structure at `../../00-product-intent/structure.md`
- the example at `../../00-product-intent/example.md` if a concrete standard would help

Review the artifact as the parent source of user intent, not as a technical design.

## Review For

- **Story centrality**: are accepted user stories first-class rather than incidental?
- **Standard story form**: are stories recognizable as "As a / I want / so that" unless there is a justified exception?
- **Actor clarity**: is it clear who the work is for?
- **Outcome clarity**: is the user-facing outcome concrete rather than broad vision?
- **Acceptance signals**: can story satisfaction be recognized?
- **Boundary discipline**: are non-goals explicit enough to prevent inferred promises?
- **Narrative shape**: is a flat list enough, or does the product area need workflow grouping?
- **Traceability**: do downstream references preserve accountability without duplicating every touched file?
- **Change discipline**: do meaningful changes to accepted intent trigger impact review without overprocessing editorial edits?

## Produce

Help produce one of these outputs:

- review findings with concrete fixes
- confirmation that the Product Intent artifact is ready to govern downstream work
- revision guidance that keeps the artifact story-centered
- explicit escalation when the artifact is being asked to absorb architecture, spec, or planning work

## Workflow

1. Identify the user outcome and actors the artifact claims to govern.
2. Check whether user stories are explicit, accepted, and recognizable.
3. Test acceptance signals for concreteness.
4. Probe boundaries and non-goals for missing inferred commitments.
5. Decide whether the story organization preserves product readability.
6. Check traceability against downstream references and avoid both gaps and duplication.
7. Check change-review guidance for impact-based discipline.
8. Return concrete findings or pass confirmation.

## Failure Modes To Avoid

- treating review as copyediting
- accepting broad product vision as Product Intent
- letting stories become a backlog list without user outcome
- demanding technical design detail from Product Intent
- ignoring meaningful changes because they look like wording edits
- requiring full-chain review for harmless editorial cleanup

## Boundary Rule

If review finds missing user intent, revise Product Intent. If review finds technical uncertainty, escalate to research, pre-ADR, or ADR. If review finds behavioral ambiguity under accepted intent, strengthen the spec. If review finds delivery ambiguity, strengthen the implementation plan.
