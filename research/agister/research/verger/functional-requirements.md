---
date: 2026-09-27
status: draft
---

# Agister functional requirements derived from Verger lessons

These requirements synthesize repeated needs observed in the consolidated
[Verger orchestration lessons](lessons/agent-orchestration.md) (**Core**) and
[addendum 3](lessons/verger-orchestration-lessons-addendum-3.md) (**A3**). The
lessons are evidence and operational experience, not a normative specification.
Several observations may support one requirement, and implementation details
are not promoted into product requirements without a conceptual need.

## Goal progression

### FR-1 — Maintain a versioned goal plan

Agister shall maintain a durable goal plan containing milestones and rows with
stable identities, dependencies, state, specification and acceptance
conditions. The dependency graph shall be validated when rows are queued or
their dependencies change; unresolved or invalid dependencies shall prevent
task materialization.

Evidence: A3 L96.

### FR-2 — Materialize ready rows as tasks

Agister shall select eligible rows, materialize executable task revisions and
preserve the goal–milestone–row–task relationship throughout execution. Each
task shall have an acceptance profile that defines its allowed change scope and
required evidence according to its class, such as product code, documentation,
tooling or investigation.

Evidence: A3 L97.

### FR-3 — Evolve the plan during execution

Authorized outcomes shall be able to add, split, supersede or reprioritize rows
while execution continues. Sources include findings, failed gates,
specification rulings, manual exceptions, infrastructure defects and oversized
work. One authority shall assign identities and apply plan changes.

Evidence: Core L9, L12, L29, L34 and L53.

### FR-4 — Gate milestone and goal completion independently

Completing every known row shall not complete a milestone. The milestone's
declared deterministic gate and required coherence review must pass. Completing
one milestone shall not complete the goal; every required milestone must meet
its exit conditions.

Evidence: Core L10 and L38.

## Task execution

### FR-5 — Execute tasks through declared, bounded workflows

Each task shall execute through a versioned workflow with explicit bounds and
terminal outcomes. The workflow shall cover success, failure, suspension and
domain closure paths such as nothing found, interruption, supersession and
specification blockage.

Evidence: Core L26, L32 and L43.

### FR-6 — Run work through replaceable process adapters

Agister shall dispatch agents, deterministic checks, commands and tools through
a common process boundary while recording the exact process definition,
runtime, inputs and attempt.

### FR-7 — Support fresh execution and deliberate handoff

Task policy shall be able to require a fresh worker, a different model family
or replacement of a worker that is circling. Continuation shall be explicit
rather than an accidental reuse of accumulated model context.

Evidence: Core L5, L7 and L13.

### FR-8 — Isolate attempts and protect authoritative state

Each mutating or verifying attempt shall run in an isolated workspace. Workers
shall not directly change orchestration state, verdicts or repository history.
Work produced beyond the active row shall be preserved as unverified input and
shall not be silently accepted. Capability restrictions shall be enforced
outside prompts, environments shall expose only permitted data, and scratch
space shall be private to the attempt.

Evidence: Core L17, L18 and L22; A3 L98–L99.

## Evidence, review and acceptance

### FR-9 — Bind evidence to an exact candidate revision

Deterministic gates, mutation checks, reviews, provenance and artifacts shall
identify the exact candidate revision they evaluated.

Evidence: Core L14, L20 and L21.

### FR-10 — Validate evidence before it counts

Agister shall count evidence only after validating its prerequisites. Mutation
patches must apply and compile, a kill must occur within its bound, a hang is
not a kill, and a reproduction used to reject a finding must first be shown
capable of failing. Verification shall also prove that it exercised the tests,
tags and target scope it claims to cover. A surviving mutation shall require an
explicit test-gap or equivalence ruling.

Evidence: Core L30 and L36; A3 L89.

### FR-11 — Make acceptance a guarded state transition

Acceptance shall look up valid evidence for the exact candidate revision and
perform the repository mutation only when that evidence makes it eligible. It
shall not rerun checks or trust caller-supplied verdicts.

Evidence: Core L20, L21 and L25.

### FR-12 — Review independently and adjudicate findings

Agister shall queue independent reviews and support provenance policies such as
writer/reviewer model-family separation. A fresh judge shall classify findings.
A disputed finding shall become a reproduction row rather than being dismissed
by unsupported opinion. Review policy shall track finding ancestry and fix-chain
depth, budget both invocation count and context size, and support batching,
deferral or escalation when a chain stops representing useful progress.

Evidence: Core L3–L6, L31, L36 and L52; A3 L87–L88.

## Scheduling, observation and survival

### FR-13 — Admit work through explicit resource policy

Agister shall admit each resource-consuming process activation before
instantiating its expensive worker, queue scarce provider and machine resources,
enforce concurrency and exclusion rules, and report resource holders and queue
position. Admission policy shall support quiet slots, conflict domains,
bottleneck-aware lane limits, host prerequisites and a durable drain mode. Time
spent waiting for admission shall not consume the admitted execution time box
or model resources.

Evidence: Core L40–L42 and L52–L53; A3 L77–L86, L95 and L100.

### FR-14 — Observe execution independently of workers

Each run shall expose its start time, bound, heartbeat, process identity,
resource assignment, capped output and measured status. Agister shall
distinguish waiting, running, stalled, hung, interrupted, lost and failed work
without relying on the worker's account of itself. It shall distinguish zero,
missing, unreadable, stale and superseded observations. Monitoring shall
outlive the execution it monitors, and a missing monitor heartbeat shall itself
be observable.

Evidence: Core L24 and L43–L45; A3 L85 and L90–L92.

### FR-15 — Recover from process, provider, service and machine failure

Goal state, queues, evidence, decisions, partial work and required artifacts
shall survive relevant restarts. Recovery shall reconcile in-flight effects and
preserve partial output as unverified material where possible. Every spawned or
background effect shall have an owner, a bound, cleanup behavior and a reaper.
Routine provider or usage-limit termination shall have a resumable procedure
and a fresh-task fallback when continuation cannot be trusted.

Evidence: Core L47–L52; A3 L81, L84–L85 and L101.

## Decisions and owner interaction

### FR-16 — Route unresolved questions without unnecessarily stopping work

Specification questions shall go first to an advisor capable of making a
reversible provisional ruling. Genuine owner decisions shall suspend only the
affected work, leaving unrelated work able to progress.

Evidence: Core L8 and L55–L59.

### FR-17 — Provide one durable owner channel

Agister shall present the owner with decisions and actionable incidents rather
than routine status or raw worker output. Notifications shall derive from
committed state, and owner pauses and holds shall survive restart.

Evidence: Core L55–L63; A3 L93, L102 and L109.

### FR-18 — Turn recurring operational exceptions into planned work

Policy shall be able to create rows from repeated manual actions,
infrastructure failures, slow evidence, flakes and missing automation. Recorded
metrics shall separate useful plan progress from fixes, documentation, retries,
worker deaths, idle capacity and rework. Policy triggers shall act on those
measurements rather than serving only as dashboard reminders.

Evidence: Core L23–L24, L29, L34–L35 and L39; A3 L90–L92, L108, L112 and L116.

## Verification and execution inputs

### FR-19 — Schedule verification by scope and trigger

Agister shall support task, batch or cadence, milestone and integrated-head
verification. Policy shall declare each verification's scope, trigger, resource
class and resulting evidence. The scheduler shall fire count-, state- or
time-based triggers; a status reminder shall not satisfy a trigger. Cumulative
verification shall detect interactions between independently accepted changes.

Evidence: A3 L77–L80, L89, L94 and L112.

### FR-20 — Generate execution inputs from authoritative policy

Agister shall generate briefs, standing rules and machine-consumed control
inputs from current durable state and versioned templates and validate them as
part of generation. A manual per-run addition shall become a template change
rather than hidden session policy. Each instruction-only rule shall identify
its mechanical enforcement or be explicitly marked unenforced.

Evidence: Core L15 and L54; A3 L103–L106 and L110–L115.

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
