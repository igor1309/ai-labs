# ADR-001: Agister CLI architecture

- **Status:** Accepted
- **Date:** 2026-09-28
- **Scope:** Agister system architecture for the CLI stage (before the service)
- **Decision type:** Architecture
- **Amended by:** [ADR-002](002-verify-and-bounded-repair.md) (rule 1),
  [ADR-003](003-fan-out-and-join-workflow.md) (rules 1 and 12),
  [ADR-025](025-a-call-works-where-it-is-called.md) (rules 6, 11 and 12,
  invariant 11),
  [ADR-028](028-a-run-keeps-its-output.md) (rule 12)

## Context

Agister orchestrates work done by AI agents. The long-term design is a
durable local service. Agister is built in small steps, each testing a
hypothesis. The first steps built one capability: **calling an agent through
a provider runtime** (Claude Code, Codex) from a CLI, and recording what
happened.

The prototype showed that:

- runtimes differ in session identity, completion reporting and how they
  restrict agents: one uses a tool list, another an OS sandbox that always
  allows running commands;
- a runtime's restriction can grant more than it appears to: exposing shell
  access for one command also let the agent run other read-only commands
  without asking (observed live);
- hard-coded kinds of work, such as a "review" command, turned every new
  kind of work into a code change.

Humans and AI agents use the same CLI. Operators define agents, work and
permissions without rebuilding Agister. A persistent service comes later.
Only a composition root may instantiate and connect concrete components.

## Decision drivers

- A generic core: it performs **agent calls**, not particular kinds of work.
- Agents, work and permissions defined as settings.
- Permission enforcement that is uniform across runtimes and grants nothing
  beyond what the verified runtime mapping declares.
- Runtimes replaceable and addable without touching the core.
- An authoritative, attributable record of every call.
- One CLI surface for humans and agents.
- A service can later take over without changing the core.

## Decision

A **core that performs generic agent calls, configured entirely by
settings**, reached through a CLI that depends only on the core's client
contract. Each component of the core declares the interfaces it requires;
adapters satisfy them.

```text
 Human terminal        AI agent
      └──────── CLI ───────┘
                 │
          Client Contract
                 │
            Agister Core
  (resolve, compose, plan, call, validate, record)
                 │
  each component declares the interfaces it requires
                 │
  ┌──────────┬───┴──────┬───────────┬─────────────┐
settings   provider  repository  git, files,   run records
 store     runtimes  checkouts   caller values
                    (adapters)

Composition Root: instantiates adapters, wraps them in cross-cutting
decorators (diagnostics), wires the core.
```

The diagram shows dependency direction only. Adapters are grouped by
mechanism; each satisfies the interfaces of the components that use it, and
no interface is shared between components (rule 13).

## Terms

| Term | Meaning |
|---|---|
| **Agent** | Reusable runtime profile: runtime, model, model family, effort, whether its sessions may be continued. No task, no permissions. |
| **Process** | A named agent call: instruction, inputs and their sources, workspace, output contract, references to an agent and a policy. |
| **Policy** | Reusable limits: allowed and denied permissions, time, cost, attempts. |
| **Permission** | A named right in Agister's vocabulary, e.g. read the repository, run commands. |
| **Runtime feature** | What a runtime adapter supports, e.g. session resume, structured output. A property of the adapter, not a setting. |
| **Permission mapping** | For one runtime adapter: its restriction primitives (tools, sandbox modes, …) and every permission each primitive actually grants. |
| **Enforcement plan** | For one call: primitives to grant and permissions withheld, or a refusal. |
| **Run** | The record of one agent call. |
| **Node result** | What any unit of work (an agent call today) hands to a workflow: status, failure class, output, usage, cost, timing, artifacts, session. |
| **Continuation** | A call that deliberately resumes a finished run's session. |

## Architectural rules

### 1. The core performs agent calls, nothing more specific

The core resolves definitions, composes limits, plans enforcement, resolves
inputs, prepares the workspace, calls the runtime, validates the output and
records the run. It knows no kind of work, no particular agent and no
meaning of any output.

It is a runner, not a guard. It does not judge whether settings are right,
safe, trusted or suited to the task; they are the user's, and a project's
settings override global ones unconditionally. Its checks are about
whether settings compose and can be enforced as written, never about
whether they should be. Reviewing settings before running them is the
user's, and tooling for it belongs outside the core.

[ADR-002](002-verify-and-bounded-repair.md) adds one mechanism: the core also
runs the verification command a process declares, and resumes the call's
session to repair a failure. It still knows no meaning of the command.

[ADR-003](003-fan-out-and-join-workflow.md) adds one more: the core runs a
workflow of one fixed shape, fan-out then join, and still knows no meaning
of any node's output.

### 2. Definitions are settings

Agents, processes, policies, output contracts, permission mappings, the
permission vocabulary and service limits are settings, changeable without
rebuilding. What the agent is told is also a setting: the process defines it,
and the core only assembles it with inputs and granted permissions.

The core owns what definitions mean (schemas, versions, validation). The
interfaces that read definitions only supply documents and their origin.

Code adds mechanisms only where settings cannot express them: runtimes,
input source kinds.

### 3. Limits only narrow

Effective limits (time, cost, attempts, permissions, workspace) are
composed as service ⊇ policy ⊇ process ⊇ caller. Each layer may only narrow
the one above; widening is rejected, never clamped. A limit the runtime
cannot enforce refuses the call.
Caller overrides are recorded. Denied permissions always win over allowed
ones.

### 4. Enforcement never exceeds the mapping

Policies speak only in permissions, never in runtime primitives. The core
computes the enforcement plan from the effective permissions and the
runtime's permission mapping:

- a primitive is granted only if everything it grants is allowed;
- if the runtime requires exactly one primitive and none fits, the call is
  refused;
- allowed permissions left unprovided are withheld and recorded, and the
  call is refused if the process declared it needs them.

A mapping describes a specific adapter contract and runtime version and is
used only with the adapter contract and runtime version it describes. A
mapping is trusted only once it has been verified against the real runtime.

### 5. Runtime adapters are polymorphic and permission-blind

Runtime-specific behavior sits in runtime adapters. An adapter receives
primitives, not permissions, policies or processes, and returns a normalized
turn (status, failure class, output, usage, cost) with ordered events. It
declares the features it supports, such as continuing a session or limiting
cost; the core refuses a call that needs a missing one. Adding a runtime
means adding an adapter and its mapping.

### 6. Every call ends in a node result

A call ends in the same result any future node (agent, command, check)
will produce, so workflows route on it without knowing what ran:

- **Status:** completed, failed, interrupted or lost. The runtime's own
  report comes first, then Agister's timeout or cancellation, then the
  process exit. A runtime-reported failure is never upgraded.
- **Completed** means contract-valid output. What the output says, such as
  an unfavourable verdict, is not a status: routing on it belongs to the
  workflow. Every other status follows the failure route.
- **Failure class** from a closed set (refused, invalid output, budget
  exhausted, rate limited, auth, context overflow, runtime error, timeout,
  cancelled, abandoned, …), so a workflow can tell a retryable failure from
  a final one.
- **Usage and cost** as the runtime reports them, with their source; an
  unreported cost is unknown, never zero. **Timing** is measured by
  Agister; the runtime's own figure is kept beside it.
- **Artifacts** a call produced in a workspace it owns, stored with the
  evidence before the workspace is released.
- **Session** the call ran in, and the run it continued, if any.

Task outcomes belong to the future workflow layer.

### 7. Refusals come before the agent turn and are recorded

Everything that can refuse a call is checked before the provider turn starts.
Runtime identity probing and input resolution may run preparatory subprocesses,
but no agent turn or workspace is started. Every refusal, including invalid
definitions and limits that cannot be enforced, is recorded as evidence with
its reason.

### 8. Inputs are immutable

Before a call, every input is resolved to an immutable value: a revision to
its commit identity, content to its digest. The resolved value is what the
agent receives and what is recorded.

### 9. Agents cannot reach Agister's state

Agister's state directory (global settings and evidence) is
outside every agent's workspace and permissions, and reachable only through
Agister itself. A project's settings are files in the user's repository,
like any other: an agent given write access to the repository can change
them (rule 1).

### 10. Evidence is authoritative; diagnostics are cross-cutting

Evidence records, per call, the Agister identity separately from the
provider session, process and workspace identities, plus the exact definitions
with digests, inputs, enforcement plan, ordered events, runtime output and
outcome. Anything needed to understand a call is evidence.

Diagnostics describe Agister's own machinery. The composition root applies
them as decorators around adapters. They never change arguments, results
or errors, and they are not evidence.

### 11. Every effect has an owner and an end

Each runtime process and workspace a call creates is owned by that call,
bounded, and cleaned up on every exit path. A run record that was never
finished is read as lost, never as in progress.

### 12. Calls are independent

Concurrent calls share only settings, which they read, and evidence, which
each writes only for its own run. No call depends on another's state, with
one deliberate exception: a continuation reads a finished run's evidence to
resume its session. Continuation is explicit per call, and only for agents
that allow it.

A continuation resumes the earlier run's provider session in place, by the
session ID the runtime reported for that run; Agister never chooses a
session ID and never forks. The session is resumed as it is now: if the
run was already continued, the new turn follows those later turns too. The
continuing run records which run it continued; the earlier run's record is
not changed.

[ADR-003](003-fan-out-and-join-workflow.md) adds a second deliberate
exception: a workflow's join receives the recorded outputs of its own
workflow's fan-out nodes.

### 13. Every component collaborates through abstractions it defines

Each component declares the interfaces it requires at its own boundary, with
only the capabilities it uses, and adapters satisfy them. No interface is
shared between components, even when two need the same capability; one
adapter may satisfy several. The rule covers the interfaces a component
requires, not a contract a module offers: the client contract (rule 15) is
used by its callers and implemented by its decorators. A component that only inspects definitions or
runs therefore has no access to anything that starts a runtime or writes a
record. The rule applies recursively.

### 14. Composition is centralized

Only the composition root instantiates and connects concrete implementations
and cross-cutting decorators. The core neither discovers nor instantiates
infrastructure.

### 15. The client contract is service-shaped

The CLI depends only on the client contract. It reads no settings, records or
runtimes directly. The contract separates submitting a call from observing
it, supports cancelling and inspecting by run identity, and delivers events
as a stream that can be resumed. It therefore works unchanged whether the
core runs in-process or in a service.

### 16. No service yet; the service will replace the host, not add a path

In this stage the core runs inside the CLI process. When the service arrives,
it becomes the single operational authority, the CLI becomes its client
through the same contract, and in-process hosting is removed.

## Consequences

### Positive

- New kinds of work, agents and permission sets need no code change.
- Runtimes are added or replaced without touching the core.
- Enforcement is uniform and bounded by verified mappings.
- Every call and every refusal is attributable to exact definitions and
  inputs.
- Components are testable in isolation with substitute adapters and fake
  runtimes.
- A service can host the same core behind the same contract.

### Costs

- Settings become a versioned compatibility surface owned by the core.
- Mappings must be verified per adapter contract and runtime version before
  they are trusted.
- Coarse runtime primitives may leave permissions withheld.
- The service-shaped contract is more than a CLI strictly needs today.
- Component-declared interfaces and adapters add structure compared with a
  script.

## Alternatives considered

- **Kinds of work in code** (e.g. a "review" command): rejected. Every new
  kind of work would need a code change, and the core would collect domain
  knowledge.
- **Adapters map permissions in code**: rejected. Mappings are
  security-relevant facts that operators must inspect and correct, and it
  duplicates enforcement logic in every adapter.
- **Runtime primitives in policies**: rejected. It couples policies to
  runtimes.
- **The settings store parses definitions**: rejected. The definition
  language is Agister's contract and does not change with storage.
- **A service from the first step**: deferred. The current hypotheses need no
  persistent behavior, and rules 15–16 keep the core unchanged when it
  arrives.

## Explicit non-decisions

Implementation language and libraries; settings formats and layout; evidence
storage; which runtimes and input sources ship first; the
permission vocabulary's contents; how mappings are verified; retention and
redaction of recorded output; diagnostics technology; OS isolation
mechanisms; the service, its transport and lifecycle.

## Architectural invariants

1. The core knows no particular kind of work, agent or output meaning.
2. Agents, processes, policies, output contracts, permission mappings and
   limits are settings.
3. Limits only narrow, from service to policy to process to caller; a limit
   that cannot be enforced refuses the call.
4. Policies are expressed in permissions, never in runtime primitives.
5. No primitive is granted whose mapped grants exceed the effective
   permissions, and no mapping is used outside the adapter contract and
   runtime version it describes.
6. Runtime adapters know nothing of permissions, policies or processes.
7. Every call ends in a node result. A runtime-reported failure is never
   upgraded; completed means contract-valid output, whatever it says.
8. Every refusal happens before the provider turn starts and is recorded.
9. Inputs are resolved to immutable values before the call.
10. Agents cannot reach settings or evidence.
11. Every effect is owned and bounded, and ordinary exits clean it up; an
    unfinished run is lost. After the CLI is killed with SIGKILL, a reap that
    the next submitted call starts beside it (never inside it) attempts to
    undo the effects the run recorded; an
    attempt can fail, is bounded in time and is recorded on the run.
    Only a deliberate continuation reads another run, and never changes its
    record; it resumes the run's session in place.
12. Diagnostics never change behavior and are not evidence.
13. Concrete implementations are connected only at the composition root.
14. Humans and agents share one CLI surface that depends only on the
    service-shaped client contract.
15. When the service exists, it is the single operational authority.
16. Each component declares the interfaces it requires; no required
    interface is shared between components.
