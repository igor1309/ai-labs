---
date: 2026-05-02
model: gpt-5.5-thinking
description: "Note defining Product Intent as the story-centered parent layer for My Way artifacts."
---

# Product Intent

## Purpose

Product Intent is the user-facing parent layer above the existing My Way engineering stack. It defines the accepted product intent that research, pre-ADRs, ADRs, specs, implementation plans, code, and tests must preserve.

Preserve means not contradicting or quietly redefining the accepted intent. It does not mean covering all of it: a downstream artifact may carry any slice of the accepted scope — ten accepted stories may flow downstream one at a time, and the first slice often exists to educate the rest.

The core correction is that the workflow should not start with technical uncertainty. It should start with the user capability and outcome the work is meant to create or protect.

## What it is / what it is not

Product Intent is:

- a story-centered product artifact
- the parent frame for downstream engineering artifacts
- a way to make user-facing commitments explicit before technical work lowers the abstraction
- a traceability anchor when accepted stories shape research, decisions, specs, plans, and tests
- a place to record meaningful changes to accepted user intent

Product Intent is not:

- a soft product vision document
- a PRD replacement
- a backlog dump
- a solution design
- a reason to force every bug fix through full ceremony
- a place to decide architecture or implementation order

If user stories are buried as a minor subsection, the artifact has drifted. If the artifact becomes broad product vision without accepted stories, it has also drifted.

## Typical sequence

The full My Way sequence becomes:

1. **Product Intent** — accepted user stories and the surrounding context needed to make them accountable.
2. **Research** — problem-space exploration that clarifies or protects the accepted intent.
3. **Pre-ADR** — provisional solution-space exploration evaluated against product intent where relevant.
4. **ADR** — architectural commitment, including why the decision matters to accepted intent when applicable.
5. **Spec** — behavioral translation of accepted intent and architectural decisions into testable rules.
6. **Implementation plan** — execution sequencing that preserves product intent through delivery.
7. **Code and tests** — executable implementation and verification.

The sequence is not mandatory for every change. It describes the full path when the work needs the whole stack.

## Story-centered hierarchy

Product Intent should keep a clear hierarchy:

- goals explain why the work matters
- actors define who the work is for
- user stories define the capability and outcome
- acceptance signals define how satisfaction is recognized
- boundaries define what is not promised
- traceability connects accepted intent to downstream artifacts

The standard user-story form remains recognizable:

```text
As a <type of user>,
I want <some goal / capability>,
so that <some reason / outcome>.
```

Additional metadata may help with traceability, but it should not replace the user-story concept.

## Narrative shape

A flat list of stories is sufficient for a small change or narrow capability.

A larger product area may need stories grouped around activities, workflow steps, or a lightweight narrative flow. That grouping is useful when traceability tables preserve references but no longer make the product readable as a coherent user journey.

The grouping should clarify intent, not become a separate story-mapping ceremony.

## Relationship to downstream artifacts

Each relationship below may engage the full accepted scope or a single slice of it. Taking one story downstream while the rest wait is the normal case, not an exception.

### Research

Research may reference Product Intent when the investigation exists to clarify, protect, or unblock a user outcome. Research remains exploratory and should not convert product intent into technical commitment.

### Pre-ADR

Pre-ADR may evaluate options against Product Intent when options materially affect a user story or acceptance signal. Pre-ADR remains provisional and should not rewrite the product intent.

### ADR

ADRs may trace to Product Intent when an architectural decision enables, protects, or constrains a user-facing capability. ADRs remain architectural decision records, not product documents.

### Spec

Specs translate accepted Product Intent into behavior, rules, contracts, edge cases, and tests. Specs should not become PRDs; they operationalize intent for implementation.

### Implementation plan

Implementation plans preserve Product Intent during execution. Work may be sliced by story, component, risk, or technical dependency, but traceability should remain visible enough that execution does not drift from accepted user outcomes.

### Code and tests

Code and tests are the executable result. They prove what was built, but they are not the source of product intent.

## Change propagation

Accepted user stories are living artifacts, and accepted intent is never locked. Meaningful changes to user capability, actor, outcome, acceptance signal, or boundary can invalidate downstream assumptions and should trigger impact review.

Change flows in both directions. Downstream work — a spec slice, an implementation, a failed assumption — may teach something that changes the accepted intent itself. When it does, the rework that follows is welcome: a cascade caused by a sharper intent is the method working, not a planning failure. The directionality stays fixed — downstream artifacts never silently redefine the intent; the change lands in the intent artifact first and propagates down.

Not every wording edit needs ceremony. Editorial cleanup that preserves meaning should be recorded only when it helps readers. Review should be impact-based rather than automatic.

## Lightweight paths

Minor features and bug fixes do not always need a full Product Intent artifact.

A minor feature can reference existing Product Intent or include a compact story statement inside the change note when the capability is localized and fits current architecture.

A bug fix usually starts from expected behavior. It should escalate to Product Intent only when the defect reveals that the accepted user intent is missing, ambiguous, or being meaningfully changed.

## Summary

Product Intent makes user stories first-class without reducing My Way to a ticket list. It gives the engineering artifact chain a user-facing parent commitment and a bounded way to review downstream impact when that commitment changes.
