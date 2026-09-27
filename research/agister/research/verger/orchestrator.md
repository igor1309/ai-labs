---
date: 2026-09-27
model: gpt-6-sol
status: draft
---

# Agister: a durable orchestrator for agent work

Agister is a local orchestration service for long-running work performed by AI
agents, tools and deterministic programs. It turns a task into a validated,
observable sequence of executions without asking a model to remember the loop,
judge its own output or coordinate shared machine resources.

The design combines two bodies of work in this directory:

- the declarative task/workflow/process model from the
  [orchestrator proposal](proposals/ai-agent-orchestrator-proposal.md) and its
  [discussion](proposals/ai-agent-orchestrator-proposal-discussion.md); and
- the operational evidence from the Verger build sessions, summarized in
  [agent orchestration lessons](lessons/agent-orchestration.md) and embodied
  more concretely in the
  [build-loop orchestrator](prior-drafts/build-loop-orchestrator-v3.4.md).

The proposal supplies the general execution model. The Verger sessions supply
the constraints that make that model reliable in practice: durable state,
deterministic gates, isolated workspaces, bounded execution, explicit resource
admission, independent review and a deliberately narrow owner channel.

## The central idea

> A task is durable work. A workflow is its static control graph. A process is
> anything that performs work. Agister owns execution state and side effects.

Structural control flow belongs to the workflow graph. Computation belongs to
processes. A route may inspect a value already produced by a process, but if a
new value or judgment must be produced in order to choose the route, producing
it is itself a process.

```text
durable task
    │
    ▼
validated workflow graph ─── references ─── process definitions
    │                                      │
    │                                      └── agent/runtime profiles
    ▼
orchestration state ─── emits intents ─── isolated workers
    ▲                                      │
    └──────── records outcomes ────────────┘
```

Agister is therefore not an autonomous “manager agent.” It is a state machine,
scheduler and effect supervisor. Models are workers used where judgment or
generation is required; they do not hold the authoritative state of the run.

## The execution model

### Task

A task is the durable, mutable unit of work: implement a feature, repair a
defect, prepare a release, investigate a failure, or complete another explicit
objective. It has a stable identity and committed revisions.

A run operates against a particular task revision. Execution may refine the
task and commit a new revision without changing the workflow graph. A task
survives an interrupted or failed run and may be continued later. Successful
completion of a valid workflow run completes the task it was asked to perform.

### Workflow

A workflow is a declarative directed graph. It owns:

- sequencing;
- conditional routing;
- fan-out and fan-in;
- bounded cycles; and
- references to executable processes.

The graph is fixed for the duration of a run. Runtime discoveries may change
task or orchestration state, create follow-up work, or select another existing
route, but they do not add or remove nodes and edges.

Workflow success is derived from topology: all active paths have reached their
terminal topology and every required execution has completed successfully. A
special `end` process is unnecessary.

Before execution, Agister rejects structural errors that can be found
statically. At minimum, references must resolve, conditional routing must be
exhaustive, cycles must declare a bound on the repeating transition, joins must
have satisfiable inputs, and the declared start must be reachable.

### Process

A process is the uniform executable abstraction. Implementations may invoke:

- an AI agent;
- a tool or external API;
- code or a shell command;
- a deterministic function or transform; or
- another execution runtime added through an adapter.

Runtime-specific completion is normalized to a small orchestration outcome such
as completed, failed, interrupted or lost. Process adapters own provider
details; the graph does not know how an agent session, shell process or API call
detects completion.

A process definition also declares execution policy: its timeout, retry policy,
required resources, isolation, output schema and artifact handling. Retry is a
property of process execution, not an implicit graph cycle.

Stateful processes retain their internal state in their native runtime where
possible. On re-entry, a workflow must say whether it is continuing the same
process identity or starting a new one. Agister persists the identity and
continuation handle, not a provider's private internal state.

### Runs, attempts and effects

A workflow run is one execution of a workflow against a task revision. A
process run is one activation of a process within it. An attempt is one try by
the selected runtime.

The state machine is pure:

```text
(state, event) -> (new state, intents)
```

An intent describes a side effect such as spawning an agent, running a gate,
recording an artifact, merging a tested commit or notifying the owner. A worker
performs the effect and reports an outcome as another event. The transition that
requested the effect never assumes that it happened.

This separation makes crashes tractable. An intent is durably recorded before
its effect begins; its result is recorded before another transition depends on
it. After restart, Agister reconciles every open intent: reattach to a live
process, recover a completed result, safely repeat an idempotent effect, or mark
the run interrupted or lost.

## Control flow and dataflow

Edges express execution dependency, not implicit value passing. A process names
the outputs, artifacts and state it consumes, which may come from more than its
immediate predecessor.

```yaml
inputs:
  candidate: implement.output.commit
  tests: test.output.report
  findings:
    - adversarial_review.output
    - architecture_review.output
```

Outputs may be structured values, files, commits, patches, logs or references
to external effects. Agister records their identity and provenance. It does not
force all runtimes into a rich universal output envelope before concrete use
cases justify one.

Fan-out is multiple outgoing paths. Fan-in is convergence on a downstream node;
by default, a node waits for all active required inputs. An executable split or
join is introduced only when the operation itself computes something.

## Runtime architecture

Agister runs as one long-lived local service per machine and one state-machine
instance per repository. The service is the only writer of orchestration state.

### Durable state

The source of truth is an append-only event log in a protected per-repository
state directory outside the target working tree. Current state, the tracker,
review queue and owner inbox are projections that can be rebuilt from that log.
Run artifacts that must survive a reboot live beside it; `/tmp` is used only for
disposable material.

The target repository remains the durable authority for task inputs and accepted
artifacts. Task revisions, step specifications and accepted code are committed
before dependent work begins. Separating control state from the target tree
prevents builders from editing their own verdicts while preserving the lesson
that no essential state may exist only in an orchestrator conversation.

The log records versioned, ordered events. Startup refuses sequence gaps or a
newer unsupported format. Derived views are replaced atomically. Duplicate
results are harmless, and replay never needs to query live provider state.

### Isolation

Each agent attempt runs in a disposable clone or worktree with an explicit
permission profile, closed standard input where required, a process group, a
hard timeout and a schema for its result. Builders cannot write Agister's state
directory or the repository's authoritative branch.

Agents never merge, rebase or cherry-pick. They return a commit, patch or
structured finding. Agister performs repository mutations only after the
configured evidence is attached to the exact candidate revision.

Deterministic verification runs in a clean throwaway workspace. Mutation
patches are checked for applicability and compilation before they can count as
evidence. A hung plant, a plant that does not compile, or a test that cannot be
shown to fail proves nothing.

### Resource scheduling

The scheduler reasons about three scopes:

| Scope | Examples |
|---|---|
| Repository | builder, reviewer and judge concurrency; one state writer |
| Machine | CPU-heavy runs, stress exclusivity, disk reservations and load |
| Provider | account quotas, rate limits, availability and recovery probes |

Resources are declared by processes and admitted centrally. Waiting for a
resource does not consume the process's execution time box, and status names the
holder and queue position.

Heavy verification is serialized when its timing assumptions require it.
Load/stress reproduction is exclusive and sized from measured headroom. Reviews
do not overlap load-sensitive plant runs. Admission uses observations, not an
agent's promise that a command is light.

Provider holds require evidence from an actual failed attempt. Announced reset
times are hints, not facts. A probe attempt or an explicit owner `go` command
can lift the hold; predicted limits do not stop work.

### Observability and bounds

Every attempt has a start time, execution bound, heartbeat, process identity,
resource assignment and capped log. Agister distinguishes:

- waiting for a resource;
- running normally;
- stalled with no observable progress;
- hung past its bound;
- interrupted deliberately;
- lost after an unreconciled failure; and
- failed by the process itself.

The status surface reports measured facts rather than relaying an agent's account
of itself. It shows active work, elapsed time, queue position, resource holders,
machine load, disk headroom, holds and the single reason a step cannot advance.

Metrics include cycle time, first-pass rate, time to catch a mutation, hangs,
infrastructure-failure classes, resource wait and findings later proven false.
Metrics are connected to policy rather than collected only for display:

- falling first-pass rate causes work to be split more finely;
- persistently slow mutation detection creates a canary-test task;
- a high rate of findings later proven false triggers review of judge policy;
- repeated manual exceptions create tasks that automate or remove them; and
- orchestration work exceeding its budget freezes new loop features until
  product work catches up.

Thresholds are calibrations kept in configuration and tuned from recorded
observations. They are not universal constants copied from one project.

## The build loop as a workflow

The first production workflow is software delivery. Its main path is:

```text
brief -> build -> gate -> mutation check -> accept -> independent review -> done
            ^        |          |                       |
            |        |          |                       v
            +--------+----------+------------------ follow-up task
                 bounded correction routes
```

The stages have deliberately different authorities:

- Agister generates each brief from the durable task, process definition and a
  versioned template. Per-run prose cannot silently add policy. A new brief rule
  must also create work to enforce that rule mechanically where possible;
  enforcement comes first and the brief retains only the rationale.
- A fresh builder performs one small, test-first step in isolation.
- Deterministic scripts decide whether the exact candidate passes its gate and
  catches its mutation plants.
- Acceptance is a pure lookup of recorded evidence keyed by candidate revision;
  it never re-runs verification opportunistically.
- A reviewer from another model family receives the change without a suggested
  focus.
- A fresh judge classifies each finding. It may dismiss only a duplicate, an
  out-of-scope item or something already covered. A finding thought false becomes
  a reproduction task; only evidence that can itself fail may disprove it.
- Agister applies the result and assigns identifiers. Agents never compete to
  write the tracker.

At a milestone boundary, a cross-model coherence reviewer reads each affected
module as a whole. It looks for duplicated logic, sibling instances of repaired
bugs, boundary drift, missing abstractions and locally correct changes that do
not compose into a coherent system. Its findings follow the same judge and
evidence path as per-change review. A milestone is complete only when both its
deterministic gate and its required coherence review have passed.

A failed check is evidence, not an invitation to retry until green. Product
failures return through a bounded correction route. A suspected infrastructure
failure is classified by one shared, tested classifier; retries cannot turn an
independent test failure, race or hang into a pass. Repeated infrastructure
failures create root-cause work.

Step size is policy, not taste. A builder time-box breach is normally a signal
to split the step in the durable task plan. Investigation, implementation and a
large assertion set are separate steps when they cannot reliably fit the same
box. A fresh agent handles each step so context growth cannot silently degrade
later work.

### Specification friction

A builder can satisfy the current specification and still discover that the
specification is contradictory, awkward or missing a necessary boundary.
Agister records this as **specification friction**, distinct from product
failure and infrastructure failure.

A friction report names the governing section, the observed problem and a
proposed resolution. It enters a planner/advisor queue; a ruling may revise the
specification and create follow-up tasks. Unless the current step is impossible
or unsafe, friction does not block it and does not authorize the builder to
silently reinterpret the specification.

## Configuration boundary

The conceptual split is:

```text
workflow YAML  -> graph, routing and process references
process YAML   -> executable work and execution policy
agent TOML     -> reusable model/runtime profile
service TOML   -> machine-wide resources and safety limits
```

Illustrative workflow:

```yaml
name: build-and-review
start: build

edges:
  build:
    - to: gate
  gate:
    - when: output.passed
      to: plants
    - when: output.product_failure
      to: build
      process: new
      max_traversals: 2
    - default: true
      to: exception_judge
  plants:
    - when: output.passed
      to: accept
    - when: output.product_failure
      to: build
      process: new
      max_traversals: 2
    - default: true
      to: exception_judge
  accept:
    - to: review
  review:
    - to: judge
  judge:
    - when: output.follow_up_required
      to: build
      process: new
      max_traversals: 2
    - default: true
      terminal: true
```

Illustrative process:

```yaml
type: process
uses: agent:builder
timeout: 20m
resources: [builder]
workspace: disposable-clone
input:
  instruction: "Implement the supplied step, test first, and return a commit."
output:
  schema: builder-result.json
```

These formats and field names are provisional. The important boundary is:
workflow owns topology, process owns work, agent profile owns reusable runtime
settings, and service configuration owns shared-machine policy. Participating
processes are derived from graph references rather than duplicated in a
separate membership list.

## Owner and decision channels

The owner should not have to read the execution stream. Agister exposes one
authenticated local command channel and one concise inbox.

The inbox contains only:

- genuine owner decisions, with bounded options, trade-offs and a recommended
  choice; and
- incidents that require action outside Agister's authority.

Status stays on the dashboard. Product defects become tasks. Questions already
answered by the specification are not asked. Open implementation or build
questions go first to an advisor process, whose provisional ruling lets
unrelated work continue and remains reversible by the owner.

Owner pauses and holds are durable events, not chat messages. Commands that the
owner must run are complete, preflighted and accompanied by rollback. A
notification mechanism is driven by committed state, so delivery does not
depend on the orchestrator remembering to send it.

## Safety and invariants

The MVP should make these properties difficult to violate:

1. A model conversation is never the sole holder of orchestration state.
2. Exactly one authority writes state for a repository.
3. Every effect has a recorded intent and a recorded outcome.
4. Every run is isolated, bounded, observable and attributable to a task
   revision, workflow version and process definition.
5. Only evidence for the exact candidate revision may authorize acceptance.
6. Agents propose work and judgments; deterministic mechanisms apply state
   transitions and repository mutations.
7. A refusal changes no state except recording the refusal itself.
8. Resource and safety rules are enforced by admission, not remembered prose.
9. Essential artifacts survive a service crash and machine reboot.
10. The owner can see why work is waiting without reading worker logs.

## MVP boundary

The first version needs static workflows, bounded cycles, same/new process
re-entry, agent and command processes, explicit data references, durable events,
effect reconciliation, isolated workspaces, resource admission, generated
briefs, deterministic verification, per-change and milestone-coherence review,
specification-friction routing, review/judge routing and the owner command
channel.

It should deliberately defer dynamic graph mutation, transparent subworkflow
composition, human-as-process semantics, concurrent runs that mutate the same
task, generalized cancellation and a universal rich process-output envelope.
Those capabilities should be added only when a concrete workflow establishes
their semantics.

Agister's first success criterion is not that it can draw an arbitrary agent
graph. It is that the service can run the proven Verger build loop through
limits, crashes, flaky infrastructure and owner absence without losing state,
accepting unverified work or requiring an LLM to remember what happens next.

## Appendix: v3.4 implementation profile

The abstract model above permits more than one implementation. The
[Verger v3.4 draft](prior-drafts/build-loop-orchestrator-v3.4.md) supplies a
useful concrete profile for the first local implementation. The values and
field names below are illustrative; the safety properties are the important
part.

### Deployment and storage

- One Go service runs per build machine, with one state-machine instance and
  exclusive lock per repository.
- State lives under `~/.agister/repos/<repo-id>/`; builders cannot read or write
  it. The event log is `events.jsonl`, with version, sequence, timestamp, entity,
  event, payload and cause on every line.
- A sequence gap refuses startup. A torn final record is truncated and recorded
  as an incident. A binary refuses a newer event version, and old events are
  folded rather than rewritten.
- Generated views are replaced atomically. Run logs, mutation patches, partial
  diffs and owner-script inputs that must survive reboot live with the state,
  never in `/tmp`.
- A supervisor such as `launchd` restarts the service after a crash or reboot,
  causing reconciliation to run without an owner present.

### Concrete entity states

| Entity | Illustrative states |
|---|---|
| Task step | Main path from `queued` through build, verification, acceptance and review to `done`; also `exception` and `blocked` |
| Process run | `requested -> waiting(resource) -> running -> exited(code)` or `hung`, `lost`, `interrupted(cause)` |
| Review | `queued -> running -> exited -> judged`, with interrupted reviews returning to the queue |
| Finding | `open` followed by `follow-up`, `rejected(covered)`, `proven-false`, or `closed(scope, duplicate)` |
| Decision | `open -> answered -> applied` |
| Hold | `active(reason, evidence) -> probing -> lifted` |

A finding becomes `proven-false` only when the disproving test has itself been
shown capable of failing, for example through a mutation plant.

### Effects and recovery

Each external action runs through an intent-specific adapter:

| Intent | Concrete behavior |
|---|---|
| `SpawnAgent` | Start a pinned CLI in an isolated clone and process group, with explicit permissions, bounded execution and schema-validated output. |
| `RunGate` / `RunPlants` | Use the authoritative verification scripts, record their revision and run in a throwaway worktree while holding the heavy resource. |
| `RunStress` | Hold the exclusive machine resource and admit only from measured headroom. |
| `Merge` | Fast-forward only to the candidate revision whose evidence passed; refuse a dirty checkout or moved base. |
| `Notify` | Deliver an idempotent owner notification keyed by inbox item. |

The service records a process ID, start time and boot identity. On restart it
reattaches to a matching live process, recovers a completed result from its
files, marks work interrupted after a reboot, or records it lost when reality
cannot be established. Merge reconciliation checks whether the target is still
old, already equals the tested revision, or moved somewhere else. Notifications
may be duplicated but not silently dropped.

An interrupted run spends no product attempt unless the process caused the
interruption, such as by flooding its bounded output. A dead or timed-out
process never counts as successful evidence. Partial diffs and commits are
preserved as unverified inputs for a fresh agent.

### Resources and admission

```toml
[resources]
heavy = 1
builders = 1
reviews = 5
judges = 5

[load]
admit_below = 12
abort_above = 24

[disk]
min_free_gb = 20
reserve_gb = 2
log_cap_mb = 50

[timeouts]
baseline_multiplier = 3
floor_seconds = 20
builder_minutes = 20
stall_seconds = 300
```

These numbers are starting calibrations from Verger, not schema defaults that
all installations must inherit. A resource cap changes through a recorded
configuration event, never through an exception typed into a running session.

Machine resources are shared across repository instances. A stress run waits
for heavy jobs and reviews to drain. A load-sensitive mutation run prevents new
reviews from starting and begins only after running reviews finish. Low disk,
excess output or unsafe load interrupts affected process groups and records the
cause instead of manufacturing a product failure.

### Local control and observability

Owner mutations travel over a `0600` Unix socket. Read-only status is available
on loopback through a server-rendered dashboard and JSON/event endpoints. The
web surface escapes agent output, applies a self-only content security policy,
rejects foreign `Host` headers and masks known secret patterns.

The concrete CLI includes operations such as:

```text
agister status
agister explain <step>
agister go
agister decide <decision> <choice>
agister hold <resource> <reason>
agister lift <resource>
agister retry <step> --reason <reason>
agister retro
agister doctor
```

`explain` returns one immediate cause: a running process, failed guard, hold, or
resource with its holder and queue position. `retro` collects incidents for
batch analysis; lessons are not written into the live loop one mistake at a
time.

### Verification of the orchestrator

The service itself needs:

- table tests for every valid and invalid state/event pair;
- adapter fixtures made from real provider output, including ANSI text,
  truncated streams, limit messages and misleading decoys;
- crash tests between intent recording, effect execution and result recording;
- replay tests that reproduce projections byte for byte;
- contention tests across repositories for machine and provider resources;
- containment tests proving builders cannot mutate state, move the authoritative
  branch or launch undeclared heavy work; and
- recovery tests for reboot, process loss, moved repository state, full disk
  and duplicate outcomes.

A staged rollout first observes the existing tracker and ledger, then drives
spawning and acceptance while making the event log authoritative, and only
later absorbs scripts whose measured maintenance cost justifies moving them
into the service. Verification logic remains in scripts until there is evidence
that porting it improves correctness.
