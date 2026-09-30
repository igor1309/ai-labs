---
date: 2026-09-27
model: gpt-6-sol
status: draft
---

# Agister: a durable orchestrator for agent work

Agister is a local orchestration service for long-running goals carried out by
AI agents, tools and deterministic programs. It keeps the evolving plan, work
state, evidence and side effects outside model conversations and advances the
goal through explicit milestone boundaries.

The design is informed by real Verger build sessions, consolidated in
[agent orchestration lessons](lessons/agent-orchestration.md) and explored in
detail by the [v3.4 build-loop draft](prior-drafts/build-loop-orchestrator-v3.4.md).
Those sessions are evidence and real operational experience—an especially
useful source of observations and ideas, not a design authority. The earlier
[proposal](proposals/ai-agent-orchestrator-proposal.md) and its
[discussion](proposals/ai-agent-orchestrator-proposal-discussion.md) provide
additional hypotheses; the current design adopts ideas only when the evidence
or a concrete use case justifies them.

## The central idea

> A goal is durable intent. Its evolving plan is divided into milestones and
> durable rows; ready rows become executable tasks. A workflow governs how work
> advances, processes perform domain work, and Agister owns state, evidence,
> scheduling and side effects.

Structural control flow belongs to the workflow definition. Domain computation and
judgment belong to processes. A route may inspect a value already produced by a
process, but if a new domain value or judgment must be produced in order to
choose the route, producing it is itself a process. The core's closed built-ins
are limited to deterministic orchestration operations over authoritative state,
such as selecting planned work, rendering a versioned brief, recording a
result, checking evidence eligibility or emitting a guarded effect intent.

```text
durable goal
└── versioned plan
    ├── milestone
    │   ├── row ── becomes ── task ── governed by ── workflow
    │   │                                      └───── processes
    │   ├── more rows may be added from execution evidence
    │   └── milestone gate + coherence review
    └── later milestones
```

Agister is therefore not an autonomous “manager agent.” It is a state machine,
scheduler and effect supervisor. Models are workers used where judgment or
generation is required; they do not hold the authoritative state of the run.

## The execution model

### Goal, milestones and rows

A goal is the durable outcome Agister is advancing. Its versioned plan contains
multiple milestones, each representing a meaningful outcome boundary rather
than merely a batch of work. A milestone owns its rows, exit criteria,
deterministic gate and any required coherence review. Finishing every known row
does not finish the milestone until those exit conditions pass.

A row is the durable planning and tracking record for a necessary piece of
work. It has a stable identity, belongs to a milestone and records its reason,
acceptance evidence and state. The plan is deliberately allowed to grow while
work is running: findings, failed gates, specification rulings, manual
exceptions and operational failures may add or split rows. Agister assigns
their identities and commits the change through one writer; workers propose
work but never edit the register directly. A newly added row may become another
task as soon as it is ready, including while other tasks are running. Verger's
historical material often calls such a row a *step*; Agister uses *row* for the
durable plan record and *task* for its executable materialization.

Rows may declare dependencies. Agister validates the dependency graph whenever
rows are queued or amended and refuses to materialize work with unresolved,
cyclic or otherwise invalid prerequisites.

The goal is complete only when every required milestone has passed its exit
conditions in the versioned plan. This preserves two distinctions exposed by
Verger: row completion is not milestone completion, and milestone completion is
not goal completion.

### Task

A task is the executable materialization of a ready row. It carries the
specific brief, inputs, constraints and required evidence for that work. A task
has a stable identity and committed revisions, survives an interrupted or
failed attempt, and may be continued or revised without losing its row or
milestone context.

Each task has an acceptance profile derived from its class. The profile defines
what the task may change and which evidence it must return; product code,
documentation, orchestration tooling and investigation need not share one
acceptance path.

A consumer of `task.current` resolves it when activated and records the exact
revision used. After a suspension, resumption binds live task references to the
revision containing the applied decision, while run-start inputs remain
unchanged. Completing a task may close its row or create further rows; it never
completes the enclosing milestone or goal by implication.

### Workflow

A workflow is a declarative execution definition of named stages. It owns
sequencing, conditional routing, structured parallel work, bounded repetition,
suspension and references to executable processes.

The first required workflow boundary is concrete rather than general: goal
progression invokes task execution for one materialized task and receives its
outcome, evidence references and proposed rows. This separation protects plan
ownership. It does not imply arbitrary recursive workflow composition, and its
configuration notation remains provisional.

Agister may compile the plan to a graph internally, but graph theory is not the
authoring model. The workflow describes domain stages and their outcomes. A
route invokes its destination once. If several routes name the same
destination, each invocation is independent; the configuration has no
convergence construct that someone must classify or justify.

The authoring surface earns a construct only when observed work needs it. Its
vocabulary is therefore practical: run this stage, choose from its typed
outcomes, run these named checks concurrently and wait for all of them, suspend
for this decision, or repeat within this budget. Scheduler mechanisms do not
leak into configuration merely because they exist in an internal model.

The workflow definition is fixed for the duration of a run. Runtime discoveries
may revise goal, row, task or orchestration state and may add rows to the goal
plan, but they do not rewrite the executing workflow definition. Keeping those
two kinds of plan distinct is essential: learned work changes the goal plan;
execution continues through declared workflow behavior.

Parallel work is one structured stage. It declares named child processes and a
completion rule; the parent owns child identity, lifecycle and collected
outputs. The MVP supports `completion: all`: every child must complete
successfully before the stage produces its result. A failed child follows the
parallel stage's `on_failure` route after the other children settle. Because the
children cannot route elsewhere, the configuration never hand-wires
synchronization or invents correlation keys. First-result, quorum and
optional-child policies wait for concrete requirements.

A workflow succeeds only through an explicit `terminal: succeeded` route. Any
`terminal: failed` route fails it, and a running or suspended stage means it is
not finished. A stage with no outgoing route is a validation error; a special
`end` process and implicit leaf success are both unnecessary.

A stage has a workflow-local identity separate from its implementation. It
names a process, one operation from the core's closed set of transactional
built-ins, a structured parallel block or the concrete goal-to-task workflow
boundary described above. Built-ins may update orchestration state or emit a
durable effect intent, but they do not run through the Process Gateway as if
they were external workers.

A purely transactional built-in completes with the state transition that
records its output. An intent-backed built-in remains active until the Effect
Supervisor's normalized outcome is recorded, then produces its output or takes
its `on_failure` route. For example, acceptance emits `FastForward`, waits for
its outcome, and returns the accepted revision only after landing succeeds.

Success, failure and suspension are workflow outcomes rather than executable
processes. A terminal route declares `terminal: succeeded` or
`terminal: failed`. A suspending route declares a durable event condition and a
resume target. It consumes no process resource while suspended, and resumption
invokes the target stage. Event registration and the state snapshot used to test
the condition are committed atomically, so an event cannot be lost between the
decision to suspend and registration.

Output routes are evaluated only after a process completes successfully and
produces a valid output. Failed, interrupted or lost execution follows the
stage's `on_failure` route; absent an override, the workflow definition supplies
`terminal: failed`. Domain results such as `product_failure` and
`infrastructure_failure` are successful process outputs, not runtime failures.

Cycle and suspension bounds use named budgets declared once by the workflow.
Each budget has a frozen run-start limit and an explicit scope, such as the run
or active step identity. A stage activation, transition or suspension may
consume a named budget; all consumers share its counter. Scope changes create a
fresh counter. An exhausted budget follows the stage's `on_exhausted` route or,
by default, `terminal: failed`. That route receives a typed
`budget.exhaustion` value containing the budget name, scope and observed count.

Before execution, Agister rejects structural errors that can be found
statically. At minimum, references must resolve, conditional routing must be
exhaustive, every cycle must consume a finite budget, every parallel stage must
declare valid children and a supported completion rule, resume targets must
exist, every leaf must terminate explicitly, data entries must name declared
stages, every output reference must resolve to an earlier stage or a named child
of one parallel stage, budget limits and scope expressions must resolve,
built-ins and core resolver namespaces must be recognized, effective process
policy must fit the service ceiling, continuation must be supported by the
selected runtime, and the declared start must be reachable.

### Process

A process is the uniform executable abstraction. Implementations may invoke:

- an AI agent;
- a tool or external API;
- code or a shell command;
- a deterministic function or transform; or
- another execution runtime added through an adapter.

Runtime-specific completion is normalized to a small orchestration outcome such
as completed, failed, interrupted or lost. Process adapters own provider
details; the workflow does not know how an agent session, shell process or API
call detects completion.

A process definition owns its executable work and data contract: role,
instruction, required inputs and output schema. Its effective execution policy
includes timeout, retry, resources, workspace, tools, isolation and artifact
handling, declared either directly or through one referenced process policy.
Retry is a property of process execution, not a workflow repetition.

A process may reference one reusable process policy. Service safety limits are
the hard ceiling, the referenced policy supplies defaults, and the concrete
process may only narrow them. A policy outside the service ceiling is invalid,
not silently clamped. A concrete override is checked field by field:

| Policy field | Permitted concrete change |
|---|---|
| Timeouts, attempts and numeric quotas | Decrease |
| Tool and workspace capability sets | Remove capabilities or narrow scope |
| Isolation denials and runtime constraints | Add restrictions |
| Required resources and policy-required inputs | Add requirements |
| Required audit artifacts | Add artifacts or retain them longer |

Fields without a defined partial order are not overridable. In particular, the
output schema belongs to the concrete process rather than to the shared policy.
An incompatible override makes the effective process invalid before execution.

Tool permissions and isolation are separate enforcement layers. Tool policy
defines which capabilities are exposed to the process; isolation defines what
the Effect Supervisor permits even if a tool or runtime misbehaves. Their
effective permission is the intersection, and neither layer can grant something
the other denies.

An agent-backed process instantiates a reusable agent profile. The effective
process owns the concrete role, instruction, inputs, output contract and its
directly declared or inherited execution policy. The agent profile owns only
reusable runtime configuration: runtime and model selection, model family,
reasoning effort, session capabilities and provider-specific settings. An agent
profile is therefore not independently runnable and contains no task prompt.
Multiple processes may use the same profile for different roles. Constraints
that compare worker and author model families use the resolved profile and the
recorded provenance of the candidate-producing attempt, never an editable task
claim.

Stateful processes retain their internal state in their native runtime where
possible. A stage activation starts a new process by default. A stage may instead
declare `continue: previous_activation`; validation rejects continuation when its
profile or adapter is fresh-only. Continuation belongs to the stage, never to a
route, so alternative routes cannot disagree. Agister persists the
identity and continuation handle, not a provider's private internal state.

### Runs, attempts and effects

A workflow run is one execution of a workflow against a declared scope and
frozen input revisions. Its scope may be a goal, milestone or task. The first
Verger workflow is goal-scoped: one run advances many row-derived tasks and
milestones. A process run is one activation of a process within it. An attempt
is one try by the selected runtime.

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

The supervisor that starts an effect owns its complete lifecycle. Every child
or background process has an owner, a bound, cleanup behavior and a reaper;
early success does not skip teardown. Provider and usage-limit termination are
routine recoverable outcomes. Recovery may resume the recorded process when its
identity and inputs remain trustworthy, otherwise it starts a fresh attempt
with the earlier work explicitly marked unverified.

## Control flow and dataflow

Routes express execution dependency, not implicit value passing. A stage names
the outputs, artifacts and state it consumes, which may come from more than its
immediate predecessor. A structured parallel stage exposes its child results
under its own output:

```yaml
stages:
  review_suite:
    parallel:
      completion: all
      children:
        adversarial_review:
          process: process:adversarial_review
        architecture_review:
          process: process:architecture_review
data:
  synthesize_review:
    adversarial: review_suite.output.adversarial_review
    architecture: review_suite.output.architecture_review
```

Outputs may be structured values, files, commits, patches, logs or references
to external effects. Agister records their identity and provenance. It does not
force all runtimes into a rich universal output envelope before concrete use
cases justify one.

`stage.output` resolves to the most recent execution of that stage in the
recorded invocation chain leading to the consumer. This remains unambiguous
across bounded repetition because each pass has its own chain. If two executions
of the named producer can both reach the consumer without one following the
other, the reference is invalid and the workflow must use a structured parallel
output or durable goal, row, task or evidence state. Mutable task references
resolve when the consumer starts, and the exact task revision is recorded with its
provenance; workflow inputs remain frozen at run start.

`evidence.candidate(revision)` is a read-only core resolver backed by the
Evidence Authority. It returns the immutable candidate manifest—base revision,
diff and changed files—together with evidence and producer provenance for that
exact revision; callers cannot supply or replace any of them. Policy constraints
may dereference it from a declared candidate-revision input.

Several routes may invoke the same reusable stage, but each invocation remains
independent and receives only its declared inputs. If different failures require
different data or recovery, they use different named stages. The workflow does
not pass an untyped predecessor or generic exception object between them.

## Proposed architecture

Agister is one orchestration authority with explicit internal ports. Components
are responsibility boundaries, not necessarily separate deployed services. The
core owns orchestration decisions; surrounding components persist facts,
control capacity, perform effects and expose the system without duplicating
those decisions.

| Component | Responsibility | Interface |
|---|---|---|
| **Orchestration Core** | Validate workflows and own goal plan, milestone, row, task, run, transition and completion semantics | Accept commands and events; emit state events and effect intents |
| **State Authority** | Preserve goal plans, milestones, rows, tasks, revisions, events, outcomes, artifacts and rebuildable projections | Append and load events; store and resolve artifacts; serve historical facts |
| **Scheduler** | Admit ready work and fire declared triggers under resource, concurrency, conflict, quota, host and drain policies | Accept admission and trigger requests; return grant, wait or refusal with a reason |
| **Effect Supervisor** | Start, observe, interrupt, clean up, reap and reconcile external work | Accept effect intents; emit lifecycle observations and normalized outcomes |
| **Process Gateway** | Adapt agents, tools, commands and other runtimes to the common process contract | Accept process requests; emit progress, completion and failure outcomes |
| **Evidence Authority** | Preserve immutable candidate manifests and scoped verification, review, provenance and acceptance evidence for exact revisions and integrated heads | Resolve candidate records; accept evidence and findings; answer acceptance eligibility |
| **Interaction Boundary** | Present commands, queries, event streams, decisions and notifications to clients | Stable command, query and subscription interfaces |

The interfaces above are logical contracts, not protocol choices. The
Orchestration Core is the only component that advances workflow state. The
State Authority records that state but does not decide it. The Effect Supervisor
reports reality but does not interpret a process outcome as workflow success.
The Evidence Authority can authorize acceptance only for the exact candidate
revision covered by its evidence.

CLI, web UI, macOS integration and automation are clients of the Interaction
Boundary. They may present different views and workflows, but none writes the
State Authority or invokes workers directly. This lets the first client define
and exercise the application contract without becoming a second orchestration
implementation.

## Runtime architecture

Agister runs as one long-lived local service per machine and one state-machine
instance per repository. The service is the only writer of orchestration state.

### Durable state

The source of truth is an append-only event log in a protected per-repository
state directory outside the target working tree. Current state, the tracker,
review queue and owner inbox are projections that can be rebuilt from that log.
Run artifacts that must survive a reboot live beside it; `/tmp` is used only for
disposable material.

The target repository remains the durable authority for goal inputs, milestone
and row specifications, and accepted artifacts. Plan and task revisions, row
specifications and accepted code are committed before dependent work begins.
Separating control state from the target tree
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

The sandbox enforces capability restrictions and exposes a scrubbed environment;
prompt text is not a security boundary. Scratch space is private to the attempt,
and cleanup may remove only resources owned by that attempt.

The Effect Supervisor provisions the workspace from the effective process
policy and candidate revision for each activation. A workspace is never handed
from one process to another as ordinary output; parallel processes receive
independent workspaces unless a future schema explicitly defines safe sharing.

Agents never perform Git history operations such as merge, rebase or
cherry-pick. They return a commit, patch or structured finding. Agister performs
repository mutations only after the
configured evidence is attached to the exact candidate revision.

Deterministic verification runs in a clean throwaway workspace. Mutation
patches are checked for applicability and compilation before they can count as
evidence. A hung plant, a plant that does not compile, or a test that cannot be
shown to fail proves nothing. A verification run also records the tests, tags
and target scope it actually exercised. Every surviving mutation requires an
explicit test-gap or equivalence ruling.

### Resource scheduling

The scheduler reasons about several scopes:

| Scope | Examples |
|---|---|
| Goal | task dependencies, mutable conflict domains and drain state |
| Repository | builder, reviewer and judge concurrency; one state writer |
| Machine | CPU-heavy runs, stress exclusivity, disk reservations and load |
| Provider | account quotas, rate limits, availability and recovery probes |

Resources and conflict domains are declared by tasks and processes and admitted
centrally. Each process activation is admitted before its expensive worker is
instantiated: cheap infrastructure waits, not a model session. Waiting does not
consume the process's execution time box, and status names the holder and queue
position. Lane capacity follows the effective bottleneck rather than the
nominal number of workers available.

Heavy verification is serialized when its timing assumptions require it.
Load/stress reproduction is exclusive and sized from measured headroom. Reviews
do not overlap load-sensitive plant runs. Admission uses observations, not an
agent's promise that a command is light.

Host capabilities and settings required by a process are preconditions checked
before admission. Tasks that declare the same mutable hotspot may be serialized
even when other resources are available. A conflict preserves the candidate as
unverified work and returns the task to schedulable state rather than asking a
worker to repair shared history.

Drain is a durable scheduler state distinct from pause. Before its effective
boundary, existing capacity continues to be filled; afterward, running work may
settle but no new work starts. Status reports when only orchestration and
cleanup remain.

Provider holds require evidence from an actual failed attempt. Announced reset
times are hints, not facts. A probe attempt or an explicit owner `go` command
can lift the hold; predicted limits do not stop work.

### Verification scheduling

Verification has declared scope. A task check covers the materialized task; a
batch or cadence check covers accumulated changes; a milestone gate covers its
exit contract; and an integrated-head check detects interactions between
independently accepted candidates. Evidence records both the revision and the
scope actually exercised.

Count-, state- and time-based verification triggers are scheduled work, not
status reminders. Heavy tiers wait for an admissible quiet slot. Policies may
change their thresholds as measurements change without changing what it means
for a trigger to be due. A failed integrated-head check blocks further
acceptance and creates recovery work; it does not retroactively manufacture a
failure for one arbitrarily chosen task.

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

The monitor for an execution does not share that execution's lifecycle, and the
service itself has an external liveness signal. Missing or stale monitoring is
an observable failure, not an absence of news. Metrics distinguish a measured
zero from missing, unreadable or stale input, and a later fact may explicitly
supersede an earlier alarm.

The status surface reports measured facts rather than relaying an agent's account
of itself. It shows active work, elapsed time, queue position, resource holders,
machine load, disk headroom, holds and the single reason a row or task cannot
advance.

Metrics include useful plan progress, fix and documentation work, cycle time,
first-pass rate, time to catch a mutation, rework, worker deaths, idle capacity,
review-chain depth, hangs, infrastructure-failure classes, resource wait and
findings later proven false. Metrics are connected to policy rather than
collected only for display:

- falling first-pass rate causes work to be split more finely;
- persistently slow mutation detection creates a canary-test row;
- a high rate of findings later proven false triggers review of judge policy;
- repeated manual exceptions create rows that automate or remove them; and
- orchestration work exceeding its budget freezes new loop features until
  product work catches up.

Thresholds are calibrations kept in configuration and tuned from recorded
observations. They are not universal constants copied from one project.

## Verger execution as two workflows

Two compact workflow illustrations expose the important scope boundary. The
[advance-goal workflow](workflows/advance-goal.yaml) selects ready rows, applies
task outcomes, adds discovered rows and advances through milestone gates. The
[execute-task workflow](workflows/execute-task.yaml) takes one materialized task
through implementation, evidence, acceptance and review. It returns proposed
rows but cannot edit the goal plan or close a milestone.

```text
advance-goal:
  select row -> materialize task -> execute-task -> apply outcome -> select again
       |
       +-> no ready rows -> milestone gate -> coherence review -> next milestone

execute-task:
  prepare -> implement -> verify -> mutation check -> accept -> review
               ^          |
               +----------+ bounded correction

  review findings -> proposed rows returned to advance-goal
```

The stages have deliberately different authorities:

- Agister materializes the selected row as a task and generates its brief from
  the durable row, task revision, process definition and a versioned template.
  The generated input records its template and state revisions and is validated
  as part of generation. Per-run prose cannot silently add policy: a difference
  between the generated brief and what is sent becomes a template change. Every
  instruction-only rule names its mechanical enforcement or is marked
  unenforced; enforcement comes first and the brief retains only the rationale.
- A fresh builder performs one small, test-first step in isolation.
- Deterministic scripts decide whether the exact candidate passes its gate and
  catches its mutation plants. Their adapters attach normalized evidence and
  producer provenance to that candidate through the Evidence Authority before
  returning a completed output.
- Acceptance is a core built-in that asks the Evidence Authority whether the
  candidate revision is eligible and emits the guarded landing intent; evidence
  is never accepted as caller-supplied process data or re-run opportunistically.
- A reviewer from another model family receives the change without a suggested
  focus. The comparison uses immutable writer-attempt provenance and the
  reviewer's resolved agent profile.
- A fresh judge classifies each finding. It may dismiss only a duplicate, an
  out-of-scope item or something already covered. A finding thought false becomes
  a reproduction row, which later becomes a task; only evidence that can itself
  fail may disprove it.
- Agister applies the result and assigns identifiers. Agents never compete to
  write the tracker.

Each finding records its parent and review-fix depth. Review policy budgets both
invocation count and context size and may batch related changes, defer deeper
chains or escalate them rather than confusing repeated repair with forward
progress. The particular depth and batching thresholds are configuration, not
universal semantics.

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

Row size is policy, not taste. A builder time-box breach is normally a signal
to split the row in the durable goal plan. Investigation, implementation and a
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
specification and create follow-up rows. Unless the current task is impossible
or unsafe, the builder returns the candidate with an optional friction report;
friction does not block it and does not authorize the builder to silently
reinterpret the specification. `blocked_by_specification` is reserved for the
impossible or unsafe case.

## Configuration boundary

The conceptual split is:

```text
workflow YAML       -> stages, routing, structured parallel work and budgets
process YAML        -> executable work, data contract and policy overrides
process-policy YAML -> reusable execution-policy defaults and constraints
agent TOML          -> reusable runtime capabilities and model identity
service TOML        -> machine-wide resources and hard safety ceilings
```

For example, adversarial and architecture review processes may both use the
same `agent:reviewer` profile. Each process supplies its own instruction and
input/output contract. Their shared policy supplies read-only execution defaults
and a cross-family constraint evaluated against candidate provenance. The
profile supplies the reviewer's own model family so the constraint is
checkable. The architecture process also narrows the shared timeout, providing
a concrete composition example.

These formats and field names are provisional. The important boundary is:
workflow owns stage order, routing, parallel completion and bounds; process owns
work and its contract; process policy owns reusable execution defaults; agent
profile owns reusable runtime settings; and service configuration owns hard
ceilings. Participating processes are derived from stage definitions rather
than duplicated in a separate membership list.
Concrete examples are the
[adversarial review process](processes/adversarial-review.yaml),
[architecture review process](processes/architecture-review.yaml) and their
shared [static-review process policy](policies/static-review.yaml) and
[reviewer agent profile](agents/reviewer.toml).

## Owner and decision channels

The owner should not have to read the execution stream. Agister exposes one
authenticated local command channel and one concise inbox.

The inbox contains only:

- genuine owner decisions, with bounded options, trade-offs and a recommended
  choice; and
- incidents that require action outside Agister's authority.

Status stays on the dashboard. Product defects become rows and then tasks when
ready. Questions already answered by the specification are not asked. Open
implementation or build questions go first to an advisor process, whose
provisional ruling lets unrelated work continue and remains reversible by the
owner.

Each owner question receives one consolidated response covering the decision,
its trigger, current state and known gaps; fragments in a status stream do not
count as an answer.

Owner pauses and holds are durable events, not chat messages. Commands that the
owner must run are delivered as one complete action with preflight, verification
and rollback rather than a sequence the owner must reconstruct. A
notification mechanism is driven by committed state, so delivery does not
depend on the orchestrator remembering to send it.

## Safety and invariants

The MVP should make these properties difficult to violate:

1. A model conversation is never the sole holder of orchestration state.
2. Exactly one authority writes state for a repository.
3. Every effect has a recorded intent and a recorded outcome.
4. Every run is isolated, bounded, observable and attributable to its declared
   goal, milestone or task scope, workflow version and process definition.
5. Only evidence for the exact candidate revision may authorize acceptance.
6. Agents propose work and judgments; deterministic mechanisms apply state
   transitions and repository mutations.
7. A refusal changes no state except recording the refusal itself.
8. Resource and safety rules are enforced by admission, not remembered prose.
9. Essential artifacts survive a service crash and machine reboot.
10. The owner can see why work is waiting without reading worker logs.
11. Waiting for admission does not consume an expensive worker or its time box.
12. Every spawned effect has an owner and cleanup path, including early exit.
13. A due policy trigger becomes scheduled work rather than a reminder.

## MVP boundary

The first version needs versioned goal plans with milestones and rows, row
addition and splitting during execution, dependency validation, typed task
acceptance profiles, task materialization, static workflows, a concrete
goal-to-task workflow boundary, structured parallel stages with
`completion: all`, named cycle budgets, stage-level process continuation, agent
and command processes, explicit data references, durable events, effect
reconciliation and reaping, isolated workspaces, pre-spawn resource admission,
durable drain, generated and validated briefs, triggered verification scopes,
per-change and milestone-coherence review, review-chain tracking,
specification-friction routing, review/judge routing and the owner command
channel.

It should deliberately defer dynamic workflow-definition mutation, generalized
workflow composition beyond that concrete boundary, first-result and quorum
parallel completion, human-as-process semantics, concurrent runs that mutate the
same goal plan, generalized cancellation and a universal rich process-output
envelope. Those capabilities should be added only when a concrete workflow
establishes their semantics.

Agister's first success criterion is not that it offers a universal orchestration
notation. It is that the service can run the proven Verger build loop through
limits, crashes, flaky infrastructure and owner absence without losing state,
accepting unverified work or requiring an LLM to remember what happens next.

## Appendix: v3.4 implementation profile

The abstract model above permits more than one implementation. The
[Verger v3.4 draft](prior-drafts/build-loop-orchestrator-v3.4.md) supplies a
useful concrete profile for the first local implementation. The values and
field names below are illustrative; the safety properties are the important
part.

### Delivery sequence

The first implementation follows the interface split above:

1. **Core and CLI.** Complete the orchestration, state, execution and evidence
   path behind the Interaction Boundary. The CLI is the first complete client
   and the reference surface for commands, queries and recovery.
2. **Web UI.** Add an operational view and owner controls through the same
   command, query and event interfaces. It introduces no private orchestration
   behavior.
3. **macOS integration.** Add native lifecycle, notification and convenience
   surfaces after the headless behavior is established. They remain clients of
   the same boundary.

Each stage must remain usable without the later presentation layers. A feature
needed by the web or macOS surface is added first to the shared application
interface, then exposed by that client.

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
| Task step | Main path from `queued` through build, verification, acceptance and review to `done`; may be `blocked` by an explicit typed outcome |
| Workflow run | `running`, `suspended(condition, revision)`, `succeeded` or `failed` |
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
| `FastForward` | Land only the candidate revision whose evidence passed; refuse a dirty checkout or moved base. |
| `Notify` | Deliver an idempotent owner notification keyed by inbox item. |

The service records a process ID, start time and boot identity. On restart it
reattaches to a matching live process, recovers a completed result from its
files, marks work interrupted after a reboot, or records it lost when reality
cannot be established. Fast-forward reconciliation checks whether the target is still
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

[safety.llm]
capability_ceiling = [
  "repository.read",
  "repository.diff",
  "repository.search",
  "repository.write",
  "process.execute",
]
max_timeout_minutes = 30
```

These numbers are starting calibrations from Verger, not schema defaults that
all installations must inherit. A resource cap changes through a recorded
configuration event, never through an exception typed into a running session.
The service's per-runtime capability and numeric ceilings are validated before
process policies; a policy that asks for anything outside them is invalid.

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
