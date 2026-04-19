---
name: spec-review
description: Use when a spec exists and needs adversarial review for behavioral clarity, contract completeness, edge-case coverage, or boundary discipline before or during downstream work.
---

# Spec Review

## Overview

Use this skill to pressure-test a spec that already exists. Spec review checks whether the document is specific enough to guide implementation, testing, and review without relying on private interpretation.

The goal is not prose polish. The goal is to test whether the spec is complete and disciplined as a behavioral reference.

## Trigger

This skill applies when:

- a drafted spec needs review before being treated as implementation-ready
- implementation or testing exposes ambiguity in expected behavior
- a reader suspects the spec is too vague, incomplete, or drifting across boundaries
- downstream work needs confidence that the spec covers contracts, flows, edge cases, and failures adequately

Do not use this skill to decide architecture from scratch. If the behavior problem originates in an unstable design decision, return to ADR-level work.

## Inspect Before Acting

Read the spec under review first, then pull only the context needed to test it:

- the accepted ADRs the spec claims to operationalize
- relevant research or pre-ADR material only when it clarifies a disputed behavioral point
- existing contracts, product requirements, or UX requirements where they shape expected behavior
- the spec structure at [structure.md](../../../04-spec/structure.md)
- the example at [example.md](../../../04-spec/example.md) if a concrete standard would help

Review the spec against the behavior it claims to define, not against execution preferences that belong in the implementation plan.

## Preserve This Judgment

- Review tests the spec as an implementation reference, not as a prose artifact.
- The spec must remain behavioral and contract-focused.
- Review may conclude that the spec already holds. That is useful work, not failure.
- If the spec is invalidated because architecture is unstable, escalate explicitly rather than patching around the problem inside the spec.
- Review must not demand ticket slicing, build order, or other implementation-plan detail from the spec.

## Review For

- **Behavioral clarity**: are expectations concrete enough to prevent divergent implementations?
- **Contract clarity**: are interfaces, obligations, and assumptions visible?
- **Boundary discipline**: does the spec respect accepted ADRs rather than redefining them?
- **Edge-case awareness**: are failure behavior, invalid input, absence, timing, and incomplete states handled where relevant?
- **Reviewability**: can implementation be checked against this spec concretely?

## Produce

Help produce one of these outputs:

- review findings that identify concrete weaknesses in the spec
- confirmation that the spec is strong enough to guide implementation and testing
- guidance for revising the spec without collapsing it into ADR or implementation-plan work
- explicit escalation when the problem is architectural rather than behavioral

## Workflow

1. Read the spec and identify the behavior and contracts it claims to define.
2. Test whether those expectations are explicit enough for implementation and testing.
3. Probe for missing states, edge cases, and failure behavior.
4. Check whether the spec respects accepted ADR boundaries.
5. Check whether required tests are aligned to the behavior rules.
6. Decide whether the spec holds, needs revision, or should escalate to another layer.
7. Return concrete findings or revision guidance.

## Failure Modes To Avoid

- treating review as wording cleanup only
- allowing major behavior to remain implicit
- demanding architectural decisions from the spec
- demanding execution-plan detail from the spec
- missing contract gaps because the happy path looks plausible
- assuming a revisit means the spec was automatically wrong rather than incomplete or stress-tested by new information

## When Review Forces Change

If the spec is sound, keep it and move down to the implementation plan or coding. If the spec is weak but the architecture is still sound, revise the spec. If the issue comes from unstable architecture rather than behavior, return to ADR-level work explicitly.
