---
title: Pre-Coding Phase
date: 2026-05-27
model: gpt-5.5-thinking
description: "Personal note describing the pre-coding phase as a judgment-driven, iterative part of software development."
author: Igor Malyarov
version: 0.0.7
format: note
---

# Pre-Coding Phase

This note describes an opinionated approach to the pre-coding phase. It is explicitly a personal working method rather than a claim of universal process correctness. At the same time, it is grounded in real delivery experience and in repeated exposure to ambiguity, design drift, and implementation waste caused by starting to code too early.

The core premise is simple: coding should be the execution step, not the primary thinking step.

This phase is the front half of a larger loop. The back half — execution, logging, and artifact preservation — lives in [coding-phase.md](coding-phase.md). The two phases share a single goal: keeping product intent, execution, and recorded knowledge aligned as the work evolves. Software work is treated as a loop rather than a straight line; revisiting an earlier layer when implementation reality pushes back is part of the method, not a failure of it.

The thinking behind this method was shaped by Extreme Programming and continues to be — including where it deliberately diverges from XP. See [prior-art/xp-roots.md](prior-art/xp-roots.md) for the lineage.

## How to treat this method

My Way is semi-authoritative: it is a disciplined source of defaults, questions, and gates, not sacred law.

When it fits the work, follow it closely. When it is missing a concept, contradicts better engineering judgment, or pushes toward unreasonable ceremony, treat that friction as a review signal. The right response is not to ignore the method quietly, but to examine the gap and decide whether the artifact, the current work, or My Way itself should change.

The method should behave more like an interpretive study tradition than a collection of final rulings: principles are preserved by questioning, comparing cases, and refining the text when practice exposes a better distinction.

## Core idea

The pre-coding phase exists to reduce ambiguity before implementation starts. Its purpose is to:

- clarify intent
- define the user-facing outcome and accepted stories when the work needs a product parent
- expose unknowns, contradictions, and weak assumptions
- separate exploratory thinking from committed decisions
- define boundaries, responsibilities, and contracts
- make implementation a constrained follow-through rather than discovery-by-coding

This is not documentation for its own sake. It is a way to improve decision quality and reduce avoidable churn.

## Choosing the starting point

The work does not begin by selecting a document template. It begins by understanding the situation: what kind of field this is, what is already known, what is already decided, what remains unstable, and what kind of uncertainty is actually blocking progress.

The starting point is therefore a judgment call. In one case, a green-field effort may begin with exploration because the problem space itself is still unclear. In another case, a brownfield change may begin directly at spec-level thinking because the architectural decisions are already settled and the missing piece is behavioral clarity. In yet another case, a team may discover that implementation cannot proceed without revisiting architectural commitment, which means returning to ADR-level thinking before more detailed work continues.

What matters is not choosing the "correct document" first. What matters is recognizing which layer of thinking is currently load-bearing, then producing or refining the corresponding artifact as a result of that work.

## Typical sequence

What follows is a common full path, not a deterministic recipe. The actual entry point may differ, some layers may be omitted, and some may be revisited multiple times depending on the case.

### 1. Product Intent

Product Intent is the user-facing parent layer.

Its purpose is to:

- define who the work is for
- state the user capability and outcome being created or protected
- make accepted user stories first-class
- define how story satisfaction will be recognized
- set boundaries around what is not promised
- connect accepted intent to downstream artifacts when traceability matters

This stage is not about technical design. It is about the user promise that downstream research, decisions, specs, plans, code, and tests must preserve.

Typical output may include:

- product outcome
- actors
- accepted user stories
- acceptance signals or confirmation methods
- boundaries and non-goals
- open product questions
- downstream traceability
- change-review notes for meaningful intent changes

The practical value of this stage is that technical work starts from user-facing intent instead of inventing it implicitly.

See [00-product-intent/note.md](00-product-intent/note.md).

### 2. Research

Research is the exploration layer.

Its purpose is to:

- understand domain constraints
- surface relevant patterns, tradeoffs, and precedents
- identify unstable assumptions early
- gather material needed for design discussion

This stage is not yet about commitment. It is about input gathering and problem framing. Research proceeds primarily through directed Q&A cycles with AI assistants rather than passive reading.

Typical output may include:

- framing of the problem
- candidate approaches
- constraints
- risks
- key tradeoffs
- terminology
- open questions
- assumptions requiring validation

The practical value of this stage is that it avoids fake certainty.

### 3. Pre-ADR

Pre-ADR is the thinking workspace before a formal architectural decision is recorded.

Its purpose is to:

- discuss architecture without pretending the decision is already settled
- compare options
- capture the rough shape of the system
- allow correction before freezing anything

A pre-ADR can later become partially outdated. That is acceptable. Its role is exploratory, not contractual.

Typical characteristics:

- higher tolerance for ambiguity
- broader option space
- room for architecture sketches, questions, and emerging constraints
- usefulness even when later replaced by sharper documents

Its function is not authority. Its function is design digestion. A deliberate break is often taken before moving to ADR, allowing perspective to refresh.

### 4. ADR

ADR is the commitment layer.

Its purpose is to:

- record the decision actually taken
- explain why this path was chosen over alternatives
- make boundaries explicit
- reduce future reinterpretation

In this approach, ADRs are not ceremony. They are decision records. Their quality depends on:

- intent integrity
- boundary clarity
- consistency with other decisions
- stability of the chosen direction
- explicit consequences

An ADR should not read like brainstorming. It should read like resolved architecture.

### 5. Spec

The spec is where architecture turns into implementable behavior.

Its purpose is to:

- define what the system must do
- clarify contracts between parts
- specify flows, states, inputs, outputs, and edge cases
- remove ambiguity that ADR alone does not eliminate

The spec translates structural decisions into expected behavior.

Typical content may include:

- domain behavior
- component responsibilities
- API or data contracts
- state transitions
- failure cases
- UX or system interaction expectations where relevant

This is the document that makes implementation reviewable against intent.

### 6. Implementation plan

The implementation plan is the execution bridge.

Its purpose is to:

- break the spec into ordered work
- identify dependencies and sequencing
- define what gets built first
- isolate riskier parts
- make implementation incremental and testable

This is not another design document. It is operational.

Typical output may include:

- stepwise build order
- slices or phases
- dependency notes
- validation strategy
- rollout or migration notes where needed

A quality property of the plan is commit discipline: each step has mandatory test runs, and commits happen only on green.

By this stage, the main architectural thinking should already be done.

## How these artifacts differ

### Product Intent
Defines accepted user stories and the user-facing outcome that downstream artifacts must preserve.

### Research
Explores the problem space.

### Pre-ADR
Explores the solution space.

### ADR
Commits the architectural decision.

### Spec
Defines expected behavior and contract shape.

### Implementation plan
Defines execution order and delivery path.

## Iteration

Software development is iterative.

Movement across these layers is not strictly linear and not one-way. Work may move forward, pause, return to an earlier layer, or revisit several layers multiple times as coding, debugging, validation, and release expose new information.

Revisiting an earlier layer is not a sign that the process has failed. It is part of keeping the work honest against reality. If implementation reveals that a design decision is still unstable, the work may return to ADR-level thinking. If the design still holds but expected behavior is unclear, the work may return to the spec. If the decision and behavior remain sound but execution detail is missing, the work may return to the implementation plan.

The same judgment applies when choosing where to return. The first re-entry point may turn out not to be the right one, and that is acceptable. A revisit that confirms an earlier artifact still holds is still useful because it narrows the problem and protects lower-level work from compensating for the wrong cause.

Forward movement does not have to carry the entire upstream scope. A Product Intent with ten accepted stories does not obligate the next artifact to address all ten; an ADR, spec, or plan may take a single story — or a slice of one — and run it downstream first. This is the XP instinct at work: the early slice exists to educate. Working one story through decision, spec, and implementation usually teaches more about the remaining nine than any amount of upfront coverage would. Downstream artifacts must preserve the upstream intent — not contradict it, not quietly redefine it — but preserving is not the same as covering. Partial coverage is the normal shape of progress, not a gap to apologize for.

The movement back can change more than the artifact it returns to. Accepted intent is never locked. What a downstream slice teaches may flow back and change the intent itself — at any layer, at any time. When that happens, the change lands in the intent artifact first, and the cascade follows: downstream artifacts that depended on the old intent get reviewed and reworked. That cascade is not a cost to route around; it is the method working. An intent sharpened by contact with reality is worth the rework it triggers.

## Scope variants

The full sequence above is built for net-new architectural work. Two common cases do not justify the full funnel and follow lighter, alternative paths. They are escape hatches with explicit escalation rules back into the full sequence — that escalation is what keeps the lite paths honest.

### Minor feature / sub-feature

A localized capability extension that fits within already-established architecture. No new boundaries, no decision to record. The honest shape is *(optional) compact story statement or Product Intent reference → optional targeted research → delta or mini-spec → short implementation plan*, often collapsed into a single change note.

Escalates to the full sequence if the change requires a new module boundary, a new protocol, a new dependency direction, contradicts an existing ADR, or changes the accepted user-facing promise enough that downstream artifacts need impact review.

See [variants/minor-feature/note.md](variants/minor-feature/note.md).

### Bug fix

Corrective work whose goal is to remove a defect safely and prevent recurrence. The thinking is not "what should we build" but "why does reality diverge from intent." The shape is *symptom → reproduction → root cause → fix strategy → regression test*.

Escalates to a spec update if expected behavior was never defined, and to a pre-ADR if the defect violates an invariant no ADR covers.

See [variants/bug-fix/note.md](variants/bug-fix/note.md).

## AI assistants

AI assistants are used heavily throughout the pre-coding phase — not as a convenience layer, but as thinking partners. Different models (GPT, Claude, and others) are rotated deliberately across stages and review cycles to reduce blind spots inherent to any single model's reasoning style.

Each artifact goes through review. Review is a specialized concern with its own knowledge and method, encapsulated in dedicated review skills appropriate to the artifact type. For Product Intent, review checks that user stories remain first-class and that the artifact does not drift into vision, backlog, PRD, architecture, spec, or execution planning. For exploratory artifacts (research, pre-ADR), review surfaces gaps and marks them as explicit open questions. For committed artifacts (ADR, spec, implementation plan), review is adversarial by design.

## Artifacts commit

Pre-coding artifacts are committed to the repository as they are produced. Product Intent notes, research notes, pre-ADRs, ADRs, specs, and implementation plans are version-controlled alongside the code they govern. This makes the intent and decision history inspectable, reviewable, and traceable — not buried in chat logs or lost between sessions.

These artifacts are expected outputs of the work. They are not the starting point, and they are not one-shot paperwork. They are living aids for thinking, decision-making, focus, and progress. They can be revised, adapted, or deprecated as the work moves forward and reality tests earlier assumptions.

## Biases in this approach

This method strongly favors several principles.

### 1. Decision before mechanics

Architecture, responsibility, and boundaries should be settled before implementation details dominate the conversation.

### 2. Explicit boundaries

Ownership matters. Layer responsibility matters. Coupling must be introduced deliberately rather than by accident.

### 3. Progressive commitment

This approach does not favor premature formality, but it also does not tolerate indefinite vagueness. The movement from research to pre-ADR to ADR expresses a gradual increase in commitment when the situation calls for it.

### 4. Separation of exploratory and committed documents

Early documents are allowed to be imperfect or later outdated, provided they served exploration honestly. Committed documents should be sharper and more stable.

### 5. Implementation as execution, not architecture discovery

The later the stage, the less room there should be for invention. Coding should not be the first place where the system is truly understood.

## Summary

This pre-coding phase can be described as a judgment-driven effort that converts uncertainty into explicit decisions, explicit contracts, and an execution path.

It is an opinionated method, but not an arbitrary one. It comes from practical experience with the cost of ambiguity, hidden assumptions, and premature implementation. Its value lies in making difficult thinking happen before code is written, while still recognizing that software development remains iterative and that earlier decisions may need to be revisited as reality pushes back.
