---
date: 2026-10-14
description: "ADR-011: workflows are primitive invocations or compositions of workflows, with explicit control flow and data bindings"
---

# ADR-011: Composable workflows

- **Status:** Accepted
- **Topic:** Running work
- **Date:** 2026-10-14
- **Scope:** workflow composition, control flow, data flow and execution records
- **Decision type:** Architecture
- **Supersedes:** ADR-005 and ADR-007

## Executive Summary

Give every workflow a declared input and result boundary so it can be
reused within another workflow. Verification and repair become
settings-defined control flow.

## Context

Work needs sequencing, parallel execution, decisions and feedback loops.
A separate runner shape for each arrangement makes new arrangements code
changes. Bundling verification and repair into an agent call also hides
coordination that should be reusable.

## Decision

A workflow is either a primitive invocation or a composition of other
workflows. The two primitives are agent invocation and command execution.
Four operators compose workflows: sequence, parallel, branch and bounded
repetition. Named workflows package either form for reuse.

## Rules / Invariants

### 1. Primitives execute work

An agent invocation binds a process to an agent and returns validated
output and a provider session reference. The process declares the prompt,
inputs, output contract, permissions and limits. The invocation owns
provider turns and tool calls.

A command execution declares its command, inputs, working directory,
environment and limits. It returns exit code, stdout and stderr. Bash
is one execution choice.

Limits belong to every primitive, an agent invocation and a command
execution alike: time, cost where the runtime reports it, and staleness
(no output, no event).

### 2. Operators compose workflows

| Operator | Rule |
|---|---|
| Sequence | Run children in declaration order. |
| Parallel | Run children concurrently; after all end, return their statuses, classes and available outputs in declaration order. |
| Branch | Run the first child whose condition holds, or the declared default child. Resolve refuses a branch without a default. |
| Bounded repetition | Run a body with explicit state until its stopping condition holds or its iteration limit is reached. |

A join is a workflow following parallel work in a sequence. Named
references are fixed in settings and acyclic; repetition expresses
execution cycles.

### 3. Boundaries declare data flow

Each workflow declares inputs, an output contract and an output mapping
for every terminal path. Its caller has no access to internal children
or state.

Bindings supply values from workflow inputs, earlier results or repetition
state. Inputs are fixed before each primitive starts; later work may
resolve new declared source values. Inputs shared by parallel children
are resolved once before those children start. Concurrent children cannot
consume each other's outputs.

Bound values and results are immutable. Session continuation requires an
explicit binding of an earlier agent invocation's session reference.

### 4. Conditions govern acceptance and repetition

Conditions are pure expressions over structured inputs and results,
using field comparisons, collection queries and Boolean composition.
Agister evaluates them without starting work or changing state; settings
determine their meaning. The set starts small (a field equals a value, a
field is present, all or any items of a collection) and grows when a
workflow needs more.

Repetition declares initial state, a body, a next-state binding, a stopping
condition and a positive maximum number of body executions. Each completed
body supplies the next state and is checked against the stopping condition
before another iteration starts. The limit includes the first execution.
Output distinguishes condition satisfaction from limit exhaustion.

### 5. Results distinguish execution from acceptance

Primitives and workflows share a result shape: execution status, failure
class, output, usage, cost, timing, session information and warnings.
Completion means valid output was produced; acceptance is a condition
in settings. A command that exits normally completes regardless of its
exit code; that code is output for conditions to inspect.

Output is available only from completed work. A child that does not
complete ends a sequence or repetition with its status and failure class.

### 6. Execution has an owner and a record

Each primitive owns and ends its processes and worktree holds on every
exit path. A hold is the primitive's, best effort: Agister is no sandbox,
and nothing holds the worktree between primitives. Enclosing time and cost budgets cover all descendants without
resetting at child or iteration boundaries. Usage and cost count each
primitive once. Cancellation ends running descendants and starts no
further work; a workflow ends after its running descendants end.

Resolve checks definitions, references, boundaries, bindings and agent
permission plans before execution, including unselected branches.

`core/workflow` owns composition, conditions and repetition state. It
declares separate ports for agent invocation and command execution,
wired by the composition root. Input sources remain behind ports; core
reads no settings files or run records.

Records retain definitions, primitive identities and execution details,
inputs, results and parent-child relationships. They distinguish iterations
and retain condition values, branch choices, state transitions and
stopping reasons.

## Consequences

- New arrangements use existing operators without runner changes. Their
  boundaries and bindings become contracts checked by resolution.
- Adoption requires amendments to execution responsibilities and result
  transfer (ADR-001), settings definitions (ADR-002), continuation and
  admission (ADR-003 and ADR-004), recovery accounting (ADR-006), and
  input resolution (ADR-010).

## Non-Goals

- Settings syntax and expression-language grammar.
- Workflow checkpointing and resumption.
