---
date: 2026-09-27
status: draft
---

# Agister functional requirements derived from Verger lessons

These requirements synthesize repeated needs observed in the
[Verger orchestration lessons](lessons/agent-orchestration.md). The lessons are
evidence and operational experience, not a normative specification. Several
observations may support one requirement, and implementation details are not
promoted into product requirements without a conceptual need.

## Goal progression

### FR-1 — Maintain a versioned goal plan

Agister shall maintain a durable goal plan containing milestones and rows with
stable identities, dependencies, state, specification and acceptance
conditions.

### FR-2 — Materialize ready rows as tasks

Agister shall select eligible rows, materialize executable task revisions and
preserve the goal–milestone–row–task relationship throughout execution.

### FR-3 — Evolve the plan during execution

Authorized outcomes shall be able to add, split, supersede or reprioritize rows
while execution continues. Sources include findings, failed gates,
specification rulings, manual exceptions, infrastructure defects and oversized
work. One authority shall assign identities and apply plan changes.

Evidence: lessons 9, 12, 29, 34 and 53.

### FR-4 — Gate milestone and goal completion independently

Completing every known row shall not complete a milestone. The milestone's
declared deterministic gate and required coherence review must pass. Completing
one milestone shall not complete the goal; every required milestone must meet
its exit conditions.

Evidence: lessons 10 and 38.

## Task execution

### FR-5 — Execute tasks through declared, bounded workflows

Each task shall execute through a versioned workflow with explicit bounds and
terminal outcomes. The workflow shall cover success, failure, suspension and
domain closure paths such as nothing found, interruption, supersession and
specification blockage.

Evidence: lessons 26, 32 and 43.

### FR-6 — Run work through replaceable process adapters

Agister shall dispatch agents, deterministic checks, commands and tools through
a common process boundary while recording the exact process definition,
runtime, inputs and attempt.

### FR-7 — Support fresh execution and deliberate handoff

Task policy shall be able to require a fresh worker, a different model family
or replacement of a worker that is circling. Continuation shall be explicit
rather than an accidental reuse of accumulated model context.

Evidence: lessons 5, 7 and 13.

### FR-8 — Isolate attempts and protect authoritative state

Each mutating or verifying attempt shall run in an isolated workspace. Workers
shall not directly change orchestration state, verdicts or repository history.
Work produced beyond the active row shall be preserved as unverified input and
shall not be silently accepted.

Evidence: lessons 17, 18 and 22.

## Evidence, review and acceptance

### FR-9 — Bind evidence to an exact candidate revision

Deterministic gates, mutation checks, reviews, provenance and artifacts shall
identify the exact candidate revision they evaluated.

Evidence: lessons 14, 20 and 21.

### FR-10 — Validate evidence before it counts

Agister shall count evidence only after validating its prerequisites. Mutation
patches must apply and compile, a kill must occur within its bound, a hang is
not a kill, and a reproduction used to reject a finding must first be shown
capable of failing.

Evidence: lessons 30 and 36.

### FR-11 — Make acceptance a guarded state transition

Acceptance shall look up valid evidence for the exact candidate revision and
perform the repository mutation only when that evidence makes it eligible. It
shall not rerun checks or trust caller-supplied verdicts.

Evidence: lessons 20, 21 and 25.

### FR-12 — Review independently and adjudicate findings

Agister shall queue independent reviews and support provenance policies such as
writer/reviewer model-family separation. A fresh judge shall classify findings.
A disputed finding shall become a reproduction row rather than being dismissed
by unsupported opinion.

Evidence: lessons 3–6, 31, 36 and 52.

## Scheduling, observation and survival

### FR-13 — Admit work through explicit resource policy

Agister shall queue scarce provider and machine resources, enforce concurrency
and exclusion rules, and report resource holders and queue position. Time spent
waiting for admission shall not consume the admitted execution time box.

Evidence: lessons 40–42 and 52–53.

### FR-14 — Observe execution independently of workers

Each run shall expose its start time, bound, heartbeat, process identity,
resource assignment, capped output and measured status. Agister shall
distinguish waiting, running, stalled, hung, interrupted, lost and failed work
without relying on the worker's account of itself.

Evidence: lessons 24 and 43–45.

### FR-15 — Recover from process, provider, service and machine failure

Goal state, queues, evidence, decisions, partial work and required artifacts
shall survive relevant restarts. Recovery shall reconcile in-flight effects and
preserve partial output as unverified material where possible.

Evidence: lessons 47–52.

## Decisions and owner interaction

### FR-16 — Route unresolved questions without unnecessarily stopping work

Specification questions shall go first to an advisor capable of making a
reversible provisional ruling. Genuine owner decisions shall suspend only the
affected work, leaving unrelated work able to progress.

Evidence: lessons 8 and 55–59.

### FR-17 — Provide one durable owner channel

Agister shall present the owner with decisions and actionable incidents rather
than routine status or raw worker output. Notifications shall derive from
committed state, and owner pauses and holds shall survive restart.

Evidence: lessons 55–63.

### FR-18 — Turn recurring operational exceptions into planned work

Policy shall be able to create rows from repeated manual actions,
infrastructure failures, slow evidence, flakes and missing automation. Recorded
metrics shall be able to influence the goal plan rather than serving only as
dashboard output.

Evidence: lessons 23–24, 29, 34–35 and 39.

## Deliberately not fixed here

These observations inform implementation profiles or configurable policy, not
the functional requirements above:

- exact timeouts, concurrency counts, step sizes and retry limits;
- script, command and file names;
- storage formats, programming languages and deployment mechanisms;
- exact CLI syntax and presentation-layer behavior; and
- conventions such as presenting three owner options under 64 words.

The current workflow split follows the requirement boundary:
[advance-goal](workflows/advance-goal.yaml) owns plan progression and
[execute-task](workflows/execute-task.yaml) owns one task's execution. Resource,
durability, evidence and interaction capabilities serve both.
