---
name: pre-adr-review
description: Use when a pre-ADR exists and needs review for option quality, tradeoff clarity, provisional boundary clarity, or open-question quality before commitment moves to ADR.
---

# Pre-ADR Review

## Overview

Use this skill to pressure-test a pre-ADR that already exists. Pre-ADR review checks whether the exploratory architecture discussion is strong enough to support eventual commitment without pretending the decision is already made.

The goal is not to enforce correctness of a committed decision. The goal is to surface gaps, weak comparisons, hidden tensions, and unclear open questions before ADR begins.

## Trigger

This skill applies when:

- a drafted pre-ADR needs review before the work moves to ADR
- the options, tradeoffs, or provisional boundaries may still be weak or underexplored
- a reader suspects the document is repeating research rather than shaping the solution space
- downstream ADR work needs confidence that the exploratory layer has done its job

Do not use this skill to review a final committed decision. That belongs in ADR review.

## Inspect Before Acting

Read the pre-ADR under review first, then pull only the context needed to test it:

- accepted Product Intent stories the pre-ADR claims to support or protect
- the research artifacts it builds on
- relevant brainstorming or Q&A notes when they explain the option space
- existing system constraints that materially affect the options
- the pre-ADR structure at [structure.md](../../../02-pre-adr/structure.md)
- the example at [example.md](../../../02-pre-adr/example.md) if a concrete standard would help

Review the pre-ADR as exploratory design work, not as a final decision record.

## Preserve This Judgment

- Review exists to surface gaps and sharpen open questions, not to force premature commitment.
- The pre-ADR must stay exploratory and option-oriented.
- Review may conclude that the current pre-ADR is sufficient to move toward ADR. That is useful work, not failure.
- If the document is actually presenting a fixed decision, name that and move it to ADR rather than pretending exploration is still happening.
- Review must not demand implementation-plan detail or finalized behavioral specification from the pre-ADR.

## Review For

- **Option quality**: are the candidate directions plausible and distinct?
- **Tradeoff clarity**: are tradeoffs and risks explicit rather than implied?
- **Product-intent fit**: are accepted stories considered where options materially affect user outcomes?
- **Constraint visibility**: are the relevant constraints shaping the comparison?
- **Provisional boundary clarity**: are emerging responsibilities and coupling decisions visible, while still marked as provisional?
- **Open-question quality**: are the remaining unresolved items concrete and bounded enough to feed ADR?
- **Forward movement**: does the artifact move beyond research into solution-space shaping?

## Produce

Help produce one of these outputs:

- review findings that identify concrete weaknesses in the pre-ADR
- confirmation that the pre-ADR is strong enough to support the move to ADR
- guidance for revising the pre-ADR without collapsing it into ADR, spec, or implementation-plan work
- explicit escalation when the work is either too early for pre-ADR or already past it

## Workflow

1. Read the pre-ADR and identify the architectural question it is exploring.
2. Test whether the options are plausible, distinct, and compared meaningfully.
3. Probe for hidden constraints, unspoken tradeoffs, or unresolved tensions.
4. Check whether provisional boundaries are visible without being overstated as final.
5. Check whether the open questions are concrete enough to feed ADR.
6. Decide whether the pre-ADR holds, needs revision, or should escalate to research or ADR.
7. Return concrete findings or revision guidance.

## Failure Modes To Avoid

- treating review as if the decision were already committed
- accepting vague option lists with no real comparison
- missing the fact that the document is only restating research
- demanding finalized architecture, spec, or plan detail too early
- leaving unresolved tensions implicit
- assuming a revisit means the pre-ADR was automatically wrong rather than still exploratory

## When Review Forces Change

If the pre-ADR is strong enough, move toward ADR. If it is weak but the work still belongs in exploratory architecture, revise it. If the real problem is still problem understanding, return to research. If the decision is already effectively made, stop pretending and move to ADR drafting.
