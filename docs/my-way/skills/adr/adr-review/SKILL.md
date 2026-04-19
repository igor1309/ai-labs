---
name: adr-review
description: Use when an ADR exists and needs adversarial review for decision quality, boundary clarity, consistency, or stability before or during downstream work.
---

# ADR Review

## Overview

This is a transitional skill derived from [ADR note](../../../03-adr/note.md). During the transition to skills, the note remains the source of truth and this skill is its operationalized review form.

Use this skill to pressure-test an ADR that already exists. Review is adversarial by design: it should challenge the decision record, not flatter it.

## Trigger

This skill applies when:

- a drafted ADR needs review before being treated as accepted
- downstream work exposes uncertainty about whether the ADR still holds
- a reader suspects the ADR is vague, unstable, inconsistent, or hiding tradeoffs
- an ADR must be checked against adjacent decisions before further work continues

Do not use this skill to invent architecture from scratch. If the real problem is that no decision exists yet, return to drafting or pre-ADR work.

## Inspect Before Acting

Read the ADR under review first, then pull only the context needed to test it:

- adjacent accepted ADRs it may depend on or conflict with
- the relevant pre-ADR or research artifacts when the decision history matters
- spec or implementation-plan material only if needed to detect drift across layers
- the ADR structure at [structure.md](../../../03-adr/structure.md)
- the example at [example.md](../../../03-adr/example.md) if a concrete standard would help

Review the ADR against what it claims to govern, not against implementation preferences that belong elsewhere.

## Preserve This Judgment

- Review tests the quality of the recorded decision; it does not casually reopen exploration.
- The goal is not to rewrite the architecture from scratch.
- A review may conclude that the ADR still holds. That is useful work, not failure.
- If the ADR is invalidated, escalate explicitly rather than patching around the problem in lower-level artifacts.

## Review For

- **Intent integrity**: does the ADR record the real decision?
- **Boundary clarity**: is it clear what the ADR governs and what it does not?
- **Cross-decision consistency**: does it conflict with accepted ADRs?
- **Decision stability**: is this settled enough to deserve an ADR?
- **Explicit consequences**: are tradeoffs, costs, and restrictions acknowledged?

## Produce

Help produce one of these outputs:

- review findings that identify concrete weaknesses in the ADR
- confirmation that the ADR is strong enough to be treated as settled
- guidance for revising the ADR without collapsing it into a spec or implementation plan
- explicit escalation when the ADR no longer holds and a new or superseding ADR is required

## Workflow

1. Read the ADR and identify the decision it claims to lock.
2. Test whether the decision is stated clearly and honestly.
3. Probe the boundary: what does this ADR govern, and what should remain outside it?
4. Check for conflicts or silent contradictions with adjacent ADRs.
5. Check whether consequences and tradeoffs are named explicitly.
6. Decide whether the ADR holds, needs revision, or should be superseded.
7. Return concrete findings or revision guidance.

## Failure Modes To Avoid

- treating review as wording polish only
- smuggling new design work into review without naming the escalation
- judging the ADR by implementation preferences that belong in spec or plan
- asking the ADR to contain behavioral or execution detail it should not own
- nitpicking style while missing weak boundaries or hidden contradictions
- assuming a revisit means the earlier ADR was automatically wrong

## When Review Forces Change

If the ADR is still sound, keep it and move down to the right layer. If the ADR is not sound, return to ADR-level work explicitly. If the needed change reverses an accepted decision, write a superseding ADR rather than rewriting history in place.
