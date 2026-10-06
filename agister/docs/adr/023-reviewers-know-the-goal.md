# ADR-023: Reviewers know the goal

- **Status:** Proposed
- **Date:** 2026-10-06
- **Scope:** what a review node receives, and how a finding's scope
  decides its ruling
- **Decision type:** Process
- **Amends:** [ADR-020](020-the-judge-weighs-the-presented-cost-and-benefit-of-a-fix.md)
  rules 1 and 4
- **Relates to:** [ADR-003](003-fan-out-and-join-workflow.md) rules 2 and 4
- **Source:** LAB-101, LAB-93

## Context

A review node receives the base, the candidate, the changed files and its
review prompt. It is not told what the change is for: for about two
weeks the owner has kept briefs out of reviewers, as an experiment, so
that they judge the code and not the brief's claims.

A finding records its scope as `introduced_by_change`: "true if the change
introduced the problem or left it in code it touched; false if it lies
outside the change". The judge rules a finding in the change fix, waive or
owner, and one outside it `defer` (ADR-020 rule 1).

That leaves no place for existing code that stops the change from reaching
its goal. The change did not cause it, so at best it is deferred, while
the goal it was written for still fails. LAB-93 recorded such a case: in
the iOS change `fix-DBSNEW-17617`, the reviewer found that under one flag
combination the templates flow never opens, so the change's goal (a
product picked from the templates flow opens its profile) fails there. Its
own trace showed the missing case older than the change. Its requirement
came from "the commit behavior and new test claim", for want of a goal.
Every ruling on it, original and replayed, was `defer` or `reject`. Nor
can a tests reviewer that does not know the goal say which test the goal
lacks.

## Decision drivers

- A real finding that blocks the goal is fixed in the round, whoever
  wrote the code.
- The judge stays a jury (ADR-020): it receives the reviews and nothing
  else (ADR-003 rule 4), and rules on what they present.
- Every reviewer receives the same inputs: no process decides which
  reviewer knows what.
- A brief's claims stay claims: a reviewer checks them.
- Prompts, schemas and settings only; no code (ADR-001 rule 2).

## Decision

### 1. Every review node receives the goal

A review workflow takes a `goal` param: a file holding what the change is
for, such as its issue or brief. It is resolved once and every review node
receives it, as it receives the base and the candidate (ADR-003 rule 2).
The join does not (ADR-003 rule 4). A review run without a goal is a
caller's choice, and the reviewer then reviews the change alone.

### 2. A brief's claims are not binding

The goal says what the change must achieve. Its claims about scope ("out of
scope", "not needed", "handled elsewhere"), design or completeness are
claims a reviewer checks, as it checks a commit message's.

### 3. A finding's scope has three values

`introduced_by_change` is replaced by `scope`:

- `change`: the change introduced it, or left it in code it touched.
- `goal`: the change did not cause it, but the goal fails because of it:
  existing code on the goal's path, or a test the goal needs and lacks.
  The finding quotes the goal in its `requirement`.
- `outside`: neither.

### 4. The judge rules `goal` as it rules `change`

A finding whose evidence holds and whose scope is `change` or `goal` is
ruled fix, waive or owner under ADR-020 rules 1 to 3. One whose scope is
`outside` is `defer`. The judge still reads no goal: a `goal` finding
presents the goal it fails as its requirement, and its case and trace show
that it fails, or it is rejected like any other finding.

### 5. Left out

- A goal-aware reviewer beside blind ones: rejected below.
- Reviewing beyond the change and its goal, such as a module or a
  component: LAB-96.

## Consequences

- The owner's no-brief experiment ends: reviewers know what the change is
  for, and can anchor on it. Rule 2 and the adversarial review's existing
  rule that scope claims are not binding are the guard.
- Findings on old code that blocks the goal become fixes in the round, so
  a round may grow beyond the diff. That is the purpose; its size is
  measured on recorded collections (LAB-94).
- Each caller supplies a goal; a review without one behaves as today.
- Recorded reviews keep `introduced_by_change`; a judge given an older
  collection reads `true` as `change` and `false` as `outside`.

## Alternatives considered

- **Keep reviewers blind:** rejected; a finding that blocks the goal
  cannot be fixed, and a tests reviewer cannot name the test the goal
  lacks.
- **The goal to the judge only:** rejected; the reviewers still do not look
  for what blocks the goal, and the judge would link findings to it with
  facts no reviewer presented.
- **One goal-aware reviewer beside blind ones:** rejected; the tests
  reviewer still cannot point to missing tests, and settings would have to
  give different reviewers different context.
