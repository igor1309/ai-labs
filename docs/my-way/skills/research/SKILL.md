---
name: research
description: Use when a concrete question, tension, or uncertainty needs problem-space exploration, constraint discovery, terminology alignment, risk identification, and decision-useful output before design commitment.
---

# Research

## Overview

Use this skill to explore the problem space before architectural commitment. Research is the first technical reduction step after Product Intent, when Product Intent exists: it improves understanding of the problem, constraints, unknowns, tradeoffs, and relevant precedents while changes are still cheap.

Research is not performed for documentation volume. It exists to reduce false certainty and avoid premature design decisions.

## Trigger

This skill applies when:

- a concrete question, tension, or uncertainty needs exploration before design work can proceed
- the work needs problem-space understanding rather than solution commitment
- constraints, terminology, risks, precedents, or option space are still unclear
- the next design conversation would be weak without clearer framing

Do not use this skill to quietly make architectural decisions. If a decision is effectively being made, move to pre-ADR or ADR work explicitly.

## Inspect Before Acting

Start from the minimum context needed to make the research useful:

- the concrete question, tension, or area of uncertainty
- accepted Product Intent stories or open product questions when they are the reason for the research
- product or business problem
- known constraints
- existing system context
- prior incidents or pain points
- external patterns, technologies, or domain examples where relevant
- the research structure at [structure.md](../../01-research/structure.md)
- the example at [example.md](../../01-research/example.md) if a concrete pattern would help

Without a concrete starting question, research easily degrades into unfocused reading.

## Preserve This Judgment

- Research is problem-space exploration, not design commitment.
- Product Intent may define the user outcome being protected, but research must not convert that outcome into technical commitment.
- The output must have decision value for the next conversation, usually pre-ADR or equivalent design work.
- Q&A is a primary working mode: ask pointed questions, evaluate responses, follow up on weak or contradictory answers.
- Model rotation is useful to reduce blind spots and challenge framing.
- Research should surface constraints, risks, terminology, and plausible directions without pretending to lock them.
- Review at this stage means gap surfacing and open-question marking, not adversarial enforcement of a committed decision.

## Produce

Help produce a compact, decision-useful research output such as:

- problem framing
- clarified terminology
- relevant constraints
- identified risks
- candidate directions
- key tradeoffs
- open questions
- assumptions requiring validation

Write the output so it sharpens the next design conversation rather than attempting to replace it.

## Workflow

1. Start from a concrete question, tension, or uncertainty.
2. Open a directed Q&A process around constraints, risks, terminology, precedents, and unknowns.
3. Follow up on weak, surprising, or contradictory answers until the uncertainty narrows.
4. Rotate models when useful to reduce single-model blind spots.
5. Capture findings into a compact research note shaped around the problem, not around arbitrary volume.
6. Check decision value: does this output make the next design step sharper? If not, the research is not yet useful.
7. Do a lightweight review by surfacing gaps and converting them into explicit open questions.

## Failure Modes To Avoid

- treating research as passive information collection
- reading without a concrete question
- confusing research with design
- hiding decisions inside exploratory language
- letting research run indefinitely
- producing output with no decision value

## Boundary Rule

If the work starts prescribing architecture, move to pre-ADR or ADR. If the problem is still too vague to research effectively, refine the question before continuing.
