# ADR-001: Agister CLI architecture

- **Status:** Proposed
- **Date:** 2026-09-28
- **Scope:** Agister system architecture for the CLI stage (before the service)
- **Decision type:** Architecture

## Context

Agister is an orchestrator for work carried out by AI agents. The long-term
design ([orchestrator](../../../research/agister/research/verger/orchestrator.md))
is a durable local service that advances goals through workflows and
processes. Unlike Verger, Agister is built in small steps, each of which
tests a hypothesis before the next one is taken.

The first steps built one capability: **calling an agent through a provider
runtime** (Claude Code, Codex) from a CLI, with a durable record of what
happened. They produced evidence that shapes the architecture:

- Provider runtimes differ in how they identify sessions, report completion,
  and restrict what an agent may do. One runtime restricts through a list of
  tools. Another restricts through an operating-system sandbox that always
  allows running commands.
- A runtime's restriction mechanism can grant more than it appears to. Once
  shell access was exposed to allow one command, the runtime also approved
  other read-only commands without asking (observed live).
- Kinds of work were initially hard-coded (a "review" command, a review
  result format). Every new kind of work would have required a code change.

The intended interaction model is:

- humans use the CLI directly;
- AI agents use the same CLI surface humans use;
- the kinds of work, agents and permissions are defined by the person
  operating Agister, and change without rebuilding it;
- a persistent service and other clients come later.

The architecture must remain modular. Concrete technologies and
implementations must be replaceable behind explicit interfaces, and only a
composition root may instantiate and connect concrete components.

## Decision drivers

- Keep the core generic: it performs **agent calls**, not particular kinds
  of work.
- Let operators define and change agents, processes and permissions as
  settings, without rebuilding Agister.
- Enforce permissions honestly across runtimes whose restriction mechanisms
  differ, and never grant more than a policy allows.
- Keep provider runtimes replaceable and addable without touching the core.
- Keep an authoritative, attributable record of every call, separate from
  diagnostics.
- Keep CLI usage first-class for both humans and agents.
- Allow the later service to take over without changing the core.

## Decision

The Agister CLI stage uses a **ports-and-adapters core that performs generic
agent calls, configured entirely by settings**, and is reached through a
CLI that depends only on the core's client contract.

```text
 Human terminal        AI agent
      │                    │
      └──────── CLI ───────┘
                 │
          Client Contract
                 │
            Agister Core
   (agent calls: resolve, compose, plan, call, validate, record)
                 │
  ┌──────────────┼───────────────┬────────────────┬───────────────┐
  │              │               │                │               │
Definitions   Runtime         Workspace        Input Source    Evidence
  Port          Port            Port             Port            Port
  │              │               │                │               │
adapter      adapter(s)       adapter         adapter(s)       adapter
  │              │               │                │               │
settings     provider         repository      git, files,      run records,
 store       runtimes         checkouts       caller values    provenance

                    Composition Root
   instantiates concrete adapters, applies cross-cutting
   concerns (diagnostics) around ports, wires the core
```

The diagram expresses dependency boundaries, not concrete storage,
transport, process structure or plugin mechanisms.

## Terms

| Term | Meaning |
|---|---|
| **Agent** | A reusable runtime profile: which runtime, which model, model family, effort. No task and no permissions. |
| **Process** | A named agent call: instruction, declared inputs and where each comes from, workspace, output contract, and references to an agent and a policy. |
| **Policy** | Reusable execution limits: allowed and denied capabilities, time limit, attempts, constraints. |
| **Capability** | A named permission in Agister's own vocabulary, such as reading the repository or running commands. |
| **Runtime capability mapping** | For one runtime, the restriction primitives it offers (tools, sandbox modes, …) and every capability each primitive actually grants, including implicit ones. |
| **Enforcement plan** | For one call, the runtime primitives to grant and the capabilities withheld, or a refusal. |
| **Run** | One agent call's record: identities, inputs, the exact definitions used, events, outcome, output. |

## Architectural rules

### 1. The core performs agent calls, nothing more specific

The core knows how to run an agent call: resolve its definitions, compose its
limits, plan enforcement, gather inputs, prepare the workspace, call the
runtime, validate the output and record the run.

The core has no notion of any particular kind of work (review, build,
summary, …), of any particular agent, or of the meaning of any particular
output. Those are settings.

### 2. Definitions are settings

Agents, processes, policies, output contracts, runtime capability mappings,
the capability vocabulary and service limits are **settings**. They can be
created or changed without rebuilding Agister.

The core owns what these definitions mean: their schemas, versions and
validation. The Definitions Port only supplies definition documents and
where they came from, so the settings store stays replaceable.

Code provides mechanisms, never content. A mechanism is added in code only
when no combination of settings can express it: a new runtime, a new kind of
input source, a new kind of constraint.

### 3. Limits only narrow

A call's effective limits are composed as: service limits ⊇ policy ⊇
process. A process may only narrow its policy, and a policy must lie within
the service limits. A definition that widens anything is invalid, and is
rejected before any effect, not silently clamped.

Allowed capabilities and denied capabilities are separate layers. The
effective capabilities are those allowed and not denied.

### 4. Capability semantics live in settings; enforcement never over-grants

Policies speak only in capabilities. They never name runtime-specific tools
or modes.

Each runtime's capability mapping declares what its primitives grant. The
core computes the enforcement plan from the effective capabilities and the
mapping alone:

- a primitive is granted only if everything it grants is allowed;
- where a runtime requires exactly one primitive (such as a sandbox mode) and
  none fits, the call is refused;
- allowed capabilities that no fitting primitive provides are withheld, and
  the withholding is recorded;
- a process may declare capabilities it cannot work without; withholding one
  of those refuses the call.

Because implicit grants are declared in the mapping, a runtime whose
mechanism grants more than it appears to is still never over-granted.
Mappings are trusted operator settings, and every run records which mapping
it used.

### 5. Runtime integration is polymorphic and capability-blind

Runtime-specific behavior sits behind the Runtime Port: how to start the
runtime, pass the instruction and output contract, apply granted primitives,
read its progress, and decide how a turn ended.

A runtime adapter receives primitives, not capabilities, policies or
processes, and returns a normalized turn outcome and ordered events. Adding
a runtime means adding an adapter and its capability mapping. The core does
not change.

### 6. Outcomes are layered and never upgraded

- **Turn outcome** (completed, failed, interrupted, lost) comes from the
  runtime's own report first. Agister's own timeout or cancellation comes
  next, and process exit last. A runtime-reported failure is never turned
  into success by a clean exit.
- **Call outcome** (accepted, rejected, failed, refused): a completed turn
  counts only if its output satisfies the process's output contract. The
  process definition, not the core, says which valid outputs mean rejection.
- **Task outcome** belongs to the future workflow layer, not to a call.

### 7. Refusals come before effects

Everything that can refuse a call is checked before the runtime starts:
invalid definitions, limits the runtime cannot enforce, missing or unknown
inputs, unsatisfied constraints. A refusal after the run is created is
recorded as the run's outcome and nothing is spawned.

### 8. Evidence is authoritative; diagnostics are cross-cutting

The Evidence Port records every run: its own identity, separately from the
provider's session identity, the process and the workspace; the definitions
used, with content digests; the inputs; the enforcement plan; ordered
events; the raw runtime output; and the outcome. Anything needed to
understand a call is evidence.

Diagnostics describe how Agister's own machinery behaved. They are applied
by the composition root around ports and never change arguments, results or
errors. They can be filtered or disabled without losing evidence.

Constraints that compare against the origin of a revision (for example,
"reviewed by a different model family than wrote it") use only provenance
Agister recorded itself, never a claim supplied with the task.

### 9. Every component collaborates through abstractions it defines

The core defines the interfaces it requires at its own boundary. Adapters
satisfy them, and infrastructure never defines dependencies inward. Ports
are narrow: a use case that only inspects definitions or runs has no access
to anything that can start a runtime or write a record.

This rule applies recursively inside the core and inside clients. The
diagram shows only the principal boundaries.

### 10. Composition is centralized

Only the composition root instantiates and connects concrete
implementations: the settings store, runtime adapters, workspace, input
sources, evidence store, and cross-cutting decorators.

The core does not discover or instantiate infrastructure.

### 11. CLI is a first-class interface

Humans and AI agents use the same CLI semantics. The CLI depends only on
the client contract. It does not read settings, records or runtimes
directly, and it holds no knowledge of any kind of work.

### 12. The CLI stage has no service; the service will replace the host, not add a path

In this stage the core runs inside the CLI process for the duration of a
command. Nothing persists between commands except settings and evidence.

When the service is introduced, it becomes the single operational authority
and the CLI becomes its client through the same contract. In-process hosting
is then removed, not kept as a second execution path.

## Consequences

### Positive

- New kinds of work, agents and permission sets need no code change.
- Runtimes can be added or replaced without touching the core or any
  definition except their own capability mapping.
- Permission enforcement is uniform and cannot over-grant, even where a
  runtime's mechanism grants more than it appears to.
- Every run is attributable to exact definitions and reproducible in intent.
- The core, each adapter and each rule can be tested in isolation with
  substitute adapters and fake runtimes.
- The later service can host the same core behind the same contract.

### Costs

- The core must own a definition language, and settings become a
  compatibility surface that needs versioning.
- Operators must maintain capability mappings. A wrong mapping over-grants,
  so mappings need their own verification against real runtimes.
- Some useful capabilities may be withheld on a runtime whose primitives are
  too coarse, and processes must declare what they cannot do without.
- Ports and adapters add structure compared with a single script.

These costs are accepted because Agister's value depends on generic,
configurable, attributable and safely limited agent calls across runtimes.

## Alternatives considered

### Kinds of work in code

Dedicated commands and result handling per kind of work (such as a "review"
command) are simplest to start with. They were rejected because every new
kind of work, and every change to one, would require a code change, and the
core would accumulate domain knowledge it should not own.

### Runtime adapters own the capability mapping in code

Each adapter could translate capabilities to its primitives internally. This
was rejected because capability semantics are security-relevant facts that
operators must be able to inspect, verify and correct, and because it gives
every adapter its own copy of the enforcement rules.

### Runtime-specific tools in policies

Policies could list each runtime's tools directly. This was rejected because
it couples policies to runtimes, and the same policy could not run on two
runtimes.

### The settings store owns definition parsing

The adapter that reads settings could also decode and validate them. This
was rejected because the definition language is part of Agister's product
contract and does not change when the storage does. Keeping it in the core
avoids a duplicate schema and keeps validation messages in the core's terms.

### Service from the first step

A service would establish the final topology early. It was deferred because
the current steps test the agent-call hypotheses, which need no persistent
behavior, and because rule 12 keeps the core unchanged when the service
arrives.

## Explicit non-decisions

This ADR intentionally leaves the following below the architecture
boundary:

- implementation language, libraries and frameworks;
- settings formats and file layout;
- evidence storage technology and schema;
- which runtimes, input sources and constraint kinds ship first;
- the capability vocabulary's contents;
- prompt wording and output rendering;
- diagnostics technology;
- process, workspace isolation and operating-system mechanisms;
- the service, its transport and its lifecycle.

Those decisions belong to implementation specifications or later ADRs.

## Architectural invariants

1. The core performs generic agent calls and knows no particular kind of
   work, agent or output meaning.
2. Agents, processes, policies, output contracts, capability mappings and
   limits are settings, changeable without rebuilding.
3. Effective limits only narrow from service to policy to process; widening
   is rejected, never clamped.
4. Policies are expressed in capabilities, never in runtime primitives.
5. An enforcement plan never grants a primitive whose declared grants exceed
   the effective capabilities.
6. Runtime adapters receive primitives and know nothing of capabilities,
   policies or processes.
7. A runtime-reported failure is never upgraded to success; a completed turn
   counts only with contract-valid output.
8. Every refusal happens before any runtime starts.
9. Every run records its identities, exact definitions with digests,
   enforcement plan, events and outcome.
10. Diagnostics never change behavior and are not evidence.
11. Concrete implementations are connected only at the composition root.
12. Humans and agents share one CLI surface, which depends only on the
    client contract.
13. When the service exists, it is the single operational authority.

## Source basis

This ADR consolidates the architecture discussion of 2026-09-28 together
with:

- [Agister orchestrator](../../../research/agister/research/verger/orchestrator.md):
  processes, policies, agent profiles, narrowing and invariants;
- [Functional requirements](../../../research/agister/research/verger/functional-requirements.md);
- [Runtime research](../../../research/agister/research/codex-claude-orchestrator-runtime-research.md):
  separate identities, signal precedence, adapter boundary;
- evidence from the CLI prototype recorded in [README](../../README.md):
  runtime differences, the live observation of implicit command approval,
  and the removal of hard-coded kinds of work.
