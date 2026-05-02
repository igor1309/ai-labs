---
name: pre-adr-drafting
description: Use when research and discussion need to be turned into structured architectural exploration with options, tradeoffs, provisional boundaries, and open questions before committing to an ADR.
---

# Pre-ADR Drafting

## Overview

Use this skill to turn research and architectural discussion into a pre-ADR. Pre-ADR is the exploratory architecture layer between research and ADR: it shapes the solution space before commitment is made.

Pre-ADR is not the final decision record. It is the workspace in which that decision is approached.

## Trigger

This skill applies when:

- research has surfaced architectural tensions but commitment is still premature
- the work needs structured comparison of candidate directions
- the main uncertainty is which architectural direction looks strongest, not what the final decision already is
- an existing pre-ADR needs revision because the options, tradeoffs, or provisional boundaries remain vague

Do not use this skill when the real decision is already fixed. That belongs in ADR drafting.

## Inspect Before Acting

Read the minimum context needed to explore the solution space:

- accepted Product Intent stories when they shape the architectural question
- research artifacts and the open questions they surfaced
- notes from Q&A or brainstorming sessions
- domain constraints
- existing system context
- candidate architectural directions already under discussion
- known risks, tensions, and unresolved assumptions
- the pre-ADR structure at [structure.md](../../../02-pre-adr/structure.md)
- the example at [example.md](../../../02-pre-adr/example.md) if a concrete pattern would help

Read enough to shape the solution space. Do not present already-made decisions as if they were still open.

## Preserve This Judgment

- Pre-ADR is exploratory architecture discussion, not final commitment.
- Options should be evaluated against Product Intent when a direction materially supports, constrains, or risks an accepted story.
- The artifact must move beyond repeating research and into solution shaping.
- At least two plausible options should be surfaced unless the situation genuinely rules that out.
- Tradeoffs, constraints, and tensions must be made visible rather than hidden.
- Provisional boundaries should sharpen the discussion without pretending they are already final.
- Remaining open questions must be explicit and bounded so ADR work can begin from them.

## Produce

Help produce or revise a pre-ADR that makes clear:

- the architectural question or tension being explored
- the main candidate directions
- tradeoffs, risks, and constraints for each direction
- product-intent fit for directions that affect accepted stories
- the emerging direction and why it currently appears strongest
- provisional boundaries, responsibilities, or coupling decisions
- the remaining open questions that block final commitment

Write the pre-ADR so the eventual ADR is easier to write and more defensible.

## Workflow

1. Start from research and identify the architectural tension that still needs exploration.
2. Surface at least two plausible candidate directions.
3. Compare the options against constraints, tradeoffs, risks, and accepted Product Intent where relevant.
4. Eliminate or deprioritize weak directions explicitly rather than letting them fade implicitly.
5. Sharpen provisional boundaries and responsibilities as the discussion converges.
6. Capture the emerging direction without presenting it as a final decision.
7. Record the open questions that must be resolved before ADR.

## Failure Modes To Avoid

- treating pre-ADR as a softened ADR draft
- repeating research without moving into solution shaping
- hiding unresolved tensions
- allowing the discussion to remain vague
- converting interactive design reasoning into undocumented intuition
- pretending commitment exists where it does not

## Boundary Rule

If the decision is already settled, move to ADR drafting. If the work is still mostly problem understanding with no real solution-space shaping yet, return to research rather than forcing a pre-ADR too early.
