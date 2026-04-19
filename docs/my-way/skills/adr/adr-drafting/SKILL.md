---
name: adr-drafting
description: Use when architectural exploration is complete enough to lock a decision and write or revise an ADR as the commitment artifact.
---

# ADR Drafting

## Overview

Use this skill to turn settled architectural thinking into an ADR. ADR is the commitment layer of the pre-coding phase: it records the architectural decision that has been made, explains why it was made, and defines its implications clearly enough that later work does not have to reconstruct the reasoning from memory, folklore, or code.

Do not use this skill while the decision is still genuinely open.

## Trigger

This skill applies when:

- exploration has converged enough that a decision is ready to be locked
- downstream work needs an explicit architectural foundation
- the current uncertainty is no longer "which direction might work" but "what was chosen and what does it govern"
- an existing draft ADR needs revision to better reflect the real decision

Do not use this skill when the work still belongs in research or pre-ADR.

## Inspect Before Acting

Read the minimum context needed to understand the decision:

- the relevant pre-ADR and research artifacts
- adjacent accepted ADRs that may constrain or conflict with this decision
- notes from design discussion if they materially shaped the outcome
- the ADR structure at [structure.md](../../../03-adr/structure.md)
- the example at [example.md](../../../03-adr/example.md) if a concrete pattern would help

Do not restage the whole exploratory history inside the ADR. Read enough to identify the decision that emerged from it.

## Preserve This Judgment

- ADR is the commitment layer, not the exploration layer.
- The ADR must record the real decision, not a softened compromise that hides what was actually chosen.
- The ADR must define boundaries: what this decision governs and what it does not.
- The ADR must capture consequences and tradeoffs, not present the choice as cost-free.
- The ADR must stay architectural. Behavioral detail belongs in the spec. Execution detail belongs in the implementation plan.
- The ADR exists to reduce reinterpretation, drift, and repeated debate around already-resolved matters.

## Produce

Help produce or revise an ADR that makes clear:

- what decision was made
- why this direction was chosen over the main alternatives
- what constraints materially shaped the decision
- what boundaries, responsibilities, or contracts the decision establishes
- what consequences follow from accepting it
- what is explicitly out of scope

Write the ADR so downstream work can treat the decision as settled unless it is formally revisited.

## Workflow

1. Confirm the work is ready for ADR-level commitment rather than still belonging in pre-ADR.
2. Identify the decision that has actually emerged from prior exploration.
3. State the decision unambiguously.
4. Capture the decisive reasoning and rejected alternatives briefly.
5. Define the decision boundary and non-goals.
6. State consequences and tradeoffs explicitly.
7. Check consistency against adjacent accepted ADRs.
8. Submit the ADR for adversarial review rather than treating the first draft as final.

## Failure Modes To Avoid

- drafting an ADR while the decision is still genuinely open
- using the ADR as a disguised pre-ADR
- turning the ADR into a spec or implementation plan
- hiding tradeoffs or consequences
- writing vague decision text with no real boundary
- ignoring conflicts with existing ADRs
- retroactively justifying architecture that was never intentionally decided

## Supersession

Do not edit an accepted ADR to reverse its decision. If the decision changes, write a new ADR that explicitly supersedes the earlier one, references it, and explains what changed and why.
