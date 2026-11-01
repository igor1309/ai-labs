---
date: 2026-10-15
model: claude-opus-5-5
description: "ADR-012: one kind of step: a process bound to an agent, bash a runtime like any other; a run executes a workflow, a call executes a step"
---

# ADR-012: One kind of step

- **Status:** Accepted
- **Topic:** Running work
- **Date:** 2026-10-15
- **Scope:** the leaf of a workflow, the runtimes a call runs on, what a
  runtime can do, and the names of what settings define and what a run
  executes
- **Decision type:** Architecture
- **Amends:** ADR-001, ADR-002, ADR-003, ADR-004, ADR-006, ADR-009,
  ADR-010 and ADR-011
- **Revised:** 2026-10-22, bounded parallel concurrency (LAB-458)

## Context

ADR-011 names two primitives, an agent invocation and a command
execution. Its amendments give them one result shape, the same limits,
the same admission and holds, the same inputs and the same records. What
remains apart is a second port on `core/workflow`, a second chain in the
composition, and `core/command`, which starts, streams, limits and ends
a program as each runtime wrapper does. And a command can be reused only
by wrapping it in a named workflow.

Each runtime Agister drives is a program that streams events until it
ends; a shell is one too. ADR-003 already treats runtimes as unequal:
whether one resumes, takes skills or accepts an effort is a fact resolve
checks.

The ADRs also name one thing three ways (a primitive, an invocation, a
call), and mix what settings define with what a run executes.

## Decision

A workflow's leaf is a step: a process bound to an agent. Bash is a
runtime, with its wrapper, its mapping and its facts; a step whose
agent's runtime is bash runs a script. The command execution goes, with
its port, its chain and `core/command`.

Each definition has one name, each execution has one name, and an
execution names the definition it executes: a run executes a workflow,
a call executes a step.

## Terms

Definitions, in settings:

- **workflow**: work defined by its inputs, its output contract, and its
  children, composed by sequence, parallel, branch or repetition. A
  child is a step or a workflow.
- **step**: a process bound to an agent.
- **process**: what a step does: its prompt, inputs, environment,
  output schema, permissions and limits.
- **agent**: who does it: a runtime mapping, and the model, effort and
  skills its runtime takes.
- **runtime mapping**: what a runtime grants with no option, and its
  options with what each grants.
- **binding** and **condition**: data flow and decisions in a workflow
  (ADR-011, rules 3 and 4).

Executions, in records:

- **run**: an execution of a workflow. The command line starts the root
  run; a child workflow executes as a child run.
- **call**: an execution of a step.
- **iteration**: one execution of a repetition's body.
- **turn**: one exchange of a call with its runtime.
- **session**: the conversation a call held, on a runtime that keeps
  one.

Machinery, in code:

- **runtime**: a program Agister drives through its wrapper.
- **runtime facts**: what a runtime can do (ADR-003, rule 7).
- **program**: an operating-system process Agister starts.
- **hold**: a call's claim on the worktree (ADR-004).

A definition is declared, resolved and planned; it never runs or ends.
An execution starts and ends; it is never declared. "Primitive",
"invocation" and "command execution" are retired.

## Rules / Invariants

### 1. A step is the one leaf

A workflow's children are steps and workflows. A step binds a process to
an agent; the agent names the runtime. `core/workflow` declares one
port, to call a step, and never learns the runtime. A workflow of one
step executes as a run with one call.

A session belongs to the calls that held it. A continuation, by the
caller or by a binding, continues from the session's latest call: its
worktree, repository and revision, and the content it recorded at its
end (ADR-004, rule 5).

### 2. Bash is a runtime

A bash agent names the bash runtime and nothing a model takes. A prompt
is the text a runtime is given: a message to a model, a script to bash.
How a runtime takes a call's inputs is one of its facts: a model in what
it is told, bash in the script's environment. The environment a process
declares reaches every runtime's program.

Bash runs the script once, in one turn. Its output is the exit code and
the bounded head and tail of stdout and stderr, each with a digest of
the whole, as the supervisor keeps them (rule 6). A call whose script exits normally completes whatever
the exit code, and conditions read it (ADR-011, rule 5); a script that
cannot start, is ended by a limit or a cancellation, or is lost keeps
that status. Bash keeps no session.

### 3. A runtime's facts say what it can do

The facts resolve reads include what a runtime produces and reports:
output checked against a schema, tool calls and tool commands, a session
it can resume, skills it takes. A step that needs what its runtime
cannot do is refused at resolve: an output schema, a continued or
recovered session, skills, or a staleness limit on tool calls or tool
commands.

### 4. Every step is planned

A runtime mapping names what its runtime grants with no option, and
its options; a plan accounts for both. The bash mapping grants what its
environment gives, and offers no options. Resolve plans a bash step as
any other (ADR-003, rule 4): a required permission the mapping cannot
give refuses it, and what it grants beyond what the process allows is a
warning. The plan is what Agister asks; bash, like every runtime, is
not confined (ADR-001, invariant 10).

### 5. An unreported cost is unknown, not spent

A runtime that reports no cost leaves its call's cost unknown (ADR-001,
invariant 3). An unknown cost spends nothing of an enclosing cost
budget, and makes the enclosing run's cost unknown, as its result says.

### 6. One supervisor runs every program

`supervisor` is a wrapper that starts a program at the worktree root
with an environment, under its owner's identity; streams its output;
keeps a bounded head and tail of each stream with a digest of the whole;
ends the program and all it started on every exit path; and ends what
was started under a dead owner's identity. Every runtime wrapper runs
its program through it: a wrapper may use another wrapper, and neither
knows the parts that use it (ADR-001, rule 2). A dead owner's hold is
released after the supervisor has ended what it left.

A turn's no-output and no-event limits are one limit, observed by
`core/watch` on every runtime.

### 7. Core makes every call the same way

`core/call` makes a call: turns on the runtime, the output checked
against its contract, a recovery turn where the runtime resumes, and the
call ended at its time or cost limit. On bash a call has one turn.
`core/workflow` resolves its boundary inputs through `core/inputs` and
starts no child once an enclosing budget is spent. The composition
chains `inputs`, `admit` and `call`, and hands the chain to
`core/workflow` as its one port to call a step. `core/session` and
`core/command` go.

### 8. A parallel may bound concurrency

A parallel may declare the most children running at once. Without a
bound all children run at once; with one they start in declaration order
as slots become free. A failed child does not stop the next. Every
child ends before the join starts, and the join receives every outcome
in declaration order, provided at least one child completed. Cancellation
starts no further child. Every completed call is recorded.

## Consequences

- A new kind of program to run is a runtime: a wrapper, its mapping and
  its facts. No leaf, port or kind is added.
- A process's access decides its call's hold whatever the runtime: a
  bash step that writes is a writer (ADR-004, rule 3).
- Verifying is a process on a bash agent, named and reused like any
  process.
- A process names no runtime option, yet its prompt is read as its
  runtime reads it: a script given to a model is a message. Reusing a
  process across runtimes needs runtimes that read its prompt alike.
- A bash process that allows less than its environment gives warns on
  every check: bash is not confined, and the plan says so.
- Adoption amends the parts, invariants and core (ADR-001), a workflow's
  children and prompts (ADR-002), planning and runtime facts (ADR-003),
  the call and its continuation (ADR-004), staleness and recovery
  (ADR-006), the word for a program (ADR-009), input delivery (ADR-010),
  and the primitives and their terms (ADR-011).

## Non-Goals

- A schema over a bash step's stdout. Handled when a workflow needs it.
- Settings syntax for a bash agent, process and script: `settings/documents`
  specifies it, as ADR-011 leaves syntax out.
- Renaming the `processes` kind.
