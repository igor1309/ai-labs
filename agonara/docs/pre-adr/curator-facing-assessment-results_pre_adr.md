---
title: Agonara Curator-Facing Assessment Results Pre-ADR
date: 2026-06-22
description: Pre-ADR pressure-testing whether and how a curator/operator persona can see student assessment results, given that attempts are private student-owned state and assessment is automatic at submission.
model: claude-opus-4-8
version: 0.1.0
---

# Agonara Curator-Facing Assessment Results Pre-ADR

## Purpose

This document pressure-tests whether a curator (or a future instructor/operator persona)
should be able to see **student assessment results**, and if so, in what shape — given
that today student attempts are private Student-Workspace state and there is no curator
read path to them.

This document is not a data model, API design, or implementation plan, and not an
accepted ADR. It frames the question and separates two genuinely different capabilities
so a future ADR does not silently conflate them.

## Context

The trigger: someone asked the **curator** persona to "assess the students' answers" for
a topic. The curator persona structurally cannot do this, and that is by design, not a
bug.

- Student attempts, selected answers, results, and feedback are **private
  Student-Workspace state** (ADR-011:82, ADR-016:78). The API enforces it twice: a
  curator session has no effective `Student` participation → `participation_required`,
  and even another student fails the owner check → `attempt_not_found`
  (`src/student-workspace.js:1608-1620`). No curator/admin route to read another
  student's attempts exists (`src/http-contract.js`).
- Assessment itself is **automatic**, not a deferred human step: quick checks are scored
  deterministically at submission (ADR-016), and open answers are evaluated by the
  student-side evaluator against accepted criteria (ADR-013/014/015). So "assessment" is
  not what is missing — *visibility into results* is.
- ADR-016 already **defers** analytics/reporting as an explicit non-goal
  (`docs/adr/adr-016-quick-check-assessment-boundary.md:112` and `:142`), and ADR-011
  leaves a later Assessment module open (ADR-011:105). So result visibility was
  anticipated as future work, not foreclosed.

The skills were tightened (this session) so the curator skill states curators author but
do not assess, and the student skill submits answers at-capture rather than promising
"later assessment." Those edits stop the mis-routing; they do not provide result
visibility, which is the open product question this note holds.

## Two capabilities that must not be conflated

### Capability 1 — Aggregate / anonymized result reporting

Counts and distributions per check, topic, or period (how many attempted, pass/match
rates, common wrong options, weak-area patterns) **without** exposing any individual
student's private answers. This does not cross the ADR-011/016 privacy boundary and is
the lighter, lower-risk slice. It is the most likely answer to "how are students doing on
this topic."

### Capability 2 — Per-student attempt visibility

A curator/instructor sees a named student's attempts, answers, and feedback. This
**directly crosses** the ADR-011/016 privacy boundary and needs a deliberate decision
about authority, consent, and which persona is even entitled — likely a new
instructor/teacher role rather than the corpus-authoring `Program Curator`.

## Options considered

- **Status quo** — no curator result visibility; rely on the student sharing exports.
  Keeps the boundary clean but leaves the operator's real need unmet.
- **Aggregate reporting first (recommended starting point)** — define Capability 1 as a
  read-only, anonymized reporting surface, owned consistently with the eventual
  Assessment module ADR-011 anticipates. No private-answer exposure, no new persona
  required.
- **Per-student visibility** — defer Capability 2 to its own decision, gated on a
  consent/role model, because it changes the privacy contract.

## Open questions

- Audience: is the consumer the corpus-authoring `Program Curator`, or a new
  instructor/teacher role (ADR-002 currently has only Curator/Student/Admin)?
- Privacy/consent: does aggregate reporting need a minimum-cohort-size anonymization
  threshold to avoid de-anonymizing small classes?
- Ownership: does this introduce the standalone Assessment/reporting module ADR-011
  leaves open, or stay a Student-Workspace-owned read?
- Boundary integrity: how is it proven that a reporting surface never leaks answer keys,
  per-option correctness metadata, or individual private answers (cf. ADR-016 delivery
  projection rules)?

## Non-goals

- Grading mechanics, mastery/weak-area calculation, or progression policy.
- Accepted-entity withdrawal — tracked separately in
  [Accepted-Entity Lifecycle and Withdrawal Pre-ADR](accepted-entity-withdrawal_pre_adr.md).
- Concrete schema, routes, UI, or persona/role changes.
