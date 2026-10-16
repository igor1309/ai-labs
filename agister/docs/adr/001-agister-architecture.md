---
date: 2026-10-14
model: claude-opus-5-5
description: "ADR-001: Agister's architecture: what it is, its parts, their dependency rules and the invariants every part keeps"
---

# ADR-001: Agister's architecture

- **Status:** Accepted
- **Topic:** Architecture
- **Date:** 2026-10-14
- **Scope:** what Agister is, its parts and how they depend on one
  another, and the invariants every part keeps
- **Decision type:** Architecture
- **Amended by:** ADR-011 (2026-10-15), ADR-012 (2026-10-15), ADR-013
  (2026-10-15)
- **Revised:** 2026-10-16, settings, by the owner: `settings/check`
  declares a third port, a document's fields with their sources, for
  inspect

## Context

Agister's behaviours (verification, workflows, layering, holds and the
rest) each change for reasons of their own. Kept apart, each changes
without the others; that needs parts, rules for who may depend on whom,
and invariants that hold across them. This ADR fixes those; each
behaviour comes in an ADR of its own, in these parts' terms.

## Decision

Agister runs work defined in settings files, through runtimes, in the
caller's git worktree, and keeps an attributable record of every run and
every call.

Settings define; records hold what executed. A workflow is work
defined, composed of steps and other workflows; a step binds a process
to an agent. A run executes a workflow, a call executes a step. A
program is an operating-system process Agister starts.

## Parts

The parts as seen when this was designed, not a closed list: a part
added later that keeps the rules below needs no revision.

| Part | Responsibility |
|---|---|
| `cli` | Turns terminal commands into requests on the port it declares. The outer level; fails on bad input. The composition implements its port. |
| `settings/*` | The one owner of settings knowledge: where settings live (home, repository, project), how they are read, layered and resolved. Its primary operation is resolve ("can you resolve this?", "resolve this"). Resolve is the gate before a run: what resolves may run, what does not never reaches core. Check is built on resolve, which it is handed, and reports. Init, install, restore and the like use the same knowledge. Reads files through an abstract filesystem; the parser is internal. |
| `core/*` | Takes resolved settings and a run request, runs the work and streams run events. Declares the runtime protocol and the ports it needs. Knows no git and no files. |
| `runtime/<name>` | One wrapper per runtime (Claude Code, Codex, opencode, pi, bash), with its own types. Runs its program through `supervisor`. Knows nothing of core. |
| `supervisor` | A wrapper that starts a program at the worktree root with an environment, streams its output, keeps a bounded head and tail of each stream with a digest of the whole, ends the program and all it started on every exit path, and ends what a dead owner left running. |
| `git` | A wrapper over git, with its own types. Knows nothing of settings or core. |
| `runstore` | A wrapper that persists runs, with its own types. |
| `pages` | A read-only viewer of settings and runs. Its design is open (backlog). |
| `cmd/agister` | The composition root. |

## Rules

1. **No package of `cli`, `settings/*` or `core/*` imports another package
   of the module, inside its group or outside it.** Each declares its own types and
   the ports it requires. This includes `settings/check` and
   `settings/resolve`: check is handed resolve, it does not import it.
2. **Wrappers and adapters are different things.** A wrapper (a runtime
   wrapper, the supervisor, git, the run store) owns its types and knows
   nothing of the parts that use it; a runtime wrapper uses the
   supervisor. An adapter lives in the composition root, has no types of
   its own, and maps between a part's port and a wrapper, or between two
   parts.
3. **The composition root is the only place that connects parts:** wiring,
   mappers where two independent parts meet, diagnostics, logging and run
   placement. What resolve gives and what core takes are each their own
   part's; the composition maps one to the other. What it builds behind
   `cli`'s port is handed resolve: it resolves, then runs. The CLI sees
   neither.
4. **Settings are resolved before a run.** Settings that cannot be resolved
   never reach core: no run is recorded, and the composition reports the
   failure on stderr, as for a bad command. Only what core emits is recorded, so a
   refusal after resolution (a held worktree, admission) is recorded. Core
   never reads settings files.
5. **`--continue` resolves settings again**, like any run. It starts a
   run that continues the session of an earlier one-step run's call. The
   composition checks the continuation's conditions against the
   session's latest call (the same worktree, repository and revision;
   the content that call recorded at its end) and hands core the
   session. Core reads no runs.
   Inside a run, a binding continues an earlier call's session, under
   the same conditions, which `core/admit` checks.
6. **Two file formats are contracts:** the settings files and the run
   records.

Rule 1 is enforced by an architecture test on import edges alone. When
something seems to need an import these rules forbid, the design is wrong,
not the rule: it gets a port.

## Invariants

Every part keeps these.

1. **Agister runs generic work.** It runs the workflows settings
   compose from steps, each a process on an agent, whatever the agent's
   runtime. It knows no kind of work, no particular agent and no
   meaning of any output. It is a runner, not a guard: it checks whether
   settings resolve, never whether they should. A workflow that resolves
   may be run; what its calls are granted is best effort (invariant 10).
2. **Definitions live in settings, not in code.** Agents, processes,
   workflows, output contracts, runtime mappings and what Agister tells
   an agent are defined in settings files, and changed without rebuilding.
   Code adds a mechanism only where settings cannot express it: a
   runtime, an input source kind.
3. **Every call ends in one result shape.** A status (completed,
   failed, interrupted, lost) and a failure class from a closed set.
   Completed means the runtime produced its output: valid against the
   process's schema where it names one; on bash, a script that exited
   normally, with its exit code and the bounded head and tail of stdout
   and stderr, each with a digest of the whole. What the output
   says, an unfavourable verdict or a failing exit code included, is not
   a status. Usage and cost as the runtime reports them, with their
   source: an unreported cost is unknown, never zero, and spends nothing
   of a cost budget. Timing measured by Agister. The session the call
   held, on a runtime that keeps one. Its warnings. A run ends in the
   same shape.
4. **Inputs are fixed before a call starts.** Each input is resolved
   to a value and its identity (a revision to its commit, content to its
   digest); that value is what the call's runtime receives and what is
   recorded. How a runtime takes its inputs is one of its facts: a model
   in what it is told, bash in the script's environment.
5. **Agister grants no permission meant to reach its state.** Home, its
   settings and its runs are not what any permission it grants is for. A
   repository's settings are the repository's files, like any other.
6. **The record is authoritative.** Per call it keeps the Agister
   identity apart from the provider session, the exact definitions with
   their digests, the inputs, the permission plan, the ordered events
   and the outcome. Everything Agister gave the call is in it. Per run
   it keeps its workflow's definition, its inputs, its children's
   records, iterations, condition values, branch choices,
   state transitions and stopping reason. Diagnostics describe Agister's
   own machinery; they are not the record, and never change an argument,
   a result or an error.
7. **Every effect has an owner and an end.** Each program and hold a
   call creates is the call's, bounded, and ended on every exit path. A
   record whose call ended without finishing it reads as lost, never as
   running.
8. **Calls are independent.** Concurrent calls share only
   settings, which they read, records, each writing its own, and the
   worktree, through its hold. The exceptions are deliberate: a
   continuation resumes an earlier call's session, and a binding gives a
   child an earlier result of its own run.
9. **Agister is built to be changed.** The smallest design that does the
   work. A case is handled when it is met, not foreseen. A part that is
   hard to change is wrong, however much it covers.
10. **Agister acts on what settings declare, best effort.** A hold follows
    the access a process declares, and a plan is what Agister asks of a
    runtime, bash included. What a runtime, the repository or its setup
    grants or does beyond that is outside Agister: not explored, not
    enforced. Agister is no sandbox.

## Settings

Settings knows where settings live, what a file holds, how layers compose,
what each kind means, what references what, and how home is managed.

| Package | Responsibility | Ports it declares |
|---|---|---|
| `settings/layout` | Where settings live: selects home, the repository's and the nearest project's `.agister/`; maps a kind and name to its file; lists names. | filesystem (what is at a path, read, list, same directory); worktree root of a directory |
| `settings/documents` | Bytes to typed definitions with per-field provenance. Three components inside the package, each with its own unit tests: **format** (one document per file in its kind's format, unknown fields, schema version), **layering** (compose by field, `extends`, provenance), **kinds** (a composed tree to each kind's definition, with field problems). Its public interface has its own tests. | none: pure |
| `settings/resolve` | A request to resolved settings, or a refusal naming the chain. A request names any document by kind and name, or a step, a process and an agent, which resolves as a workflow of that one step; a workflow comes with its parameters. Resolve follows references, applies blocks, checks boundaries and bindings, and plans each step's permissions, in unselected branches too. | a document source; runtime facts (contracts, output against a schema, tool calls and tool commands, sessions, skills, input delivery), which the composition plugs in from the runtime wrappers |
| `settings/check` | Built on resolve: lists every document's name and resolves each, so a document nothing uses is checked too. Two views: **check** (every problem and what it refuses) and **inspect** (process, workflow and agent listings and shows, with provenance). | resolve; list names; a document's fields, each with its source |
| `settings/home` | Writes into home: installing settings, with backups to restore from. | filesystem writes; clock |

The composition assembles the document source from `layout` and
`documents`, hands `check` a resolve. It plugs a
git-backed answer into `layout`'s worktree-root port: the root of the git
worktree that holds a directory, or none outside one. `layout` knows no git.

## Core

Core takes resolved settings (the workflow, and every step's process,
agent, runtime mapping and permission plan) and a run request (the
workflow, or the step requested alone, its params, the caller's limits, the session for
`--continue`), and gives a stream of events and a result.

| Package | Responsibility | Ports it declares |
|---|---|---|
| `core/workflow` | Executes a workflow as a run: its operators (sequence, parallel, branch, bounded repetition), conditions, bindings and repetition state; resolves the workflow's inputs at its boundary; starts no child once an enclosing time or cost budget is spent; gathers its children's warnings. | inputs; call a step; events; clock |
| `core/admit` | Admits a call before it starts: what its process declares and its runtime allow what the run request asks; a call that continues a session, only if the worktree is as that session's latest call left it; and the worktree is held, as a writer alone or a reader shared. | worktree facts (revision, content), answered by the composition from `git`; hold; events |
| `core/call` | Makes a call: turns on the runtime, each turn's output checked against its contract, and a recovery turn when a staleness limit ended one, on a runtime that resumes, while the budget allows; ends the call at its time or cost limit. On bash a call has one turn. Declares the runtime protocol. | runtime protocol; staleness; events; clock; timer |
| `core/inputs` | Resolves a workflow's and a call's inputs from their sources to a value and an identity; checks a text against its brief form; keeps long values as artifacts. | sources (by name, plugged in by the composition); artifact store |
| `core/watch` | Staleness limits on a turn: no event or output, a tool command, repeated identical tool calls. Observes the event stream and reports a limit reached; it ends nothing itself. | clock; timer |
| `core/trail` | What the agent touched and was denied. A pure observer of the event stream. | none: pure |

The composition chains `inputs`, `admit` and `call`, hands `workflow`
the chain as its port to call a step and `inputs` for its boundary, plugs `watch` and `trail` into the event stream,
and hands `watch`'s reports to `call`'s staleness port.

## Runs

Core emits its events. An adapter in the composition turns them into
`runstore`'s record, and `runstore` persists it. The composition knows
where runs are placed. Core reads no runs: the CLI's commands on runs
go through `cli`'s port, which the composition serves from `runstore`.

## Reaping

A call whose owner died may leave programs running and its hold taken.
The supervisor starts each program under its owner's identity. The hold
finds the dead owner; the composition has the supervisor end what was
started under that identity, and only then releases the hold. The owner's call and run
read as lost (invariant 7).

## Starting a run

1. `cli` parses the command and makes its request on its port.
2. The composition asks settings to resolve; a failure goes to stderr and no run
   is recorded.
3. For `--continue`, the composition checks the continuation against the
   session's latest call and takes its session.
4. Core gets the resolved settings and the request, drives a runtime wrapper
   for each call through its protocol (an adapter maps between them), and streams events;
   the composition places the run and `runstore` persists it.

## Implementation notes

The composition connects parts with two kinds of small types.

- **Adapters** map a part's port onto a wrapper, or onto another part's
  port, and own no types. Why: each side keeps its own words, a change on
  one side changes only the adapter, and each side is tested without the
  other.
- **Decorators** wrap a port with the same port and add one concern:
  diagnostics, logging, run placement, reporting a settings failure on
  stderr, checking a continuation. Why: a concern is added or removed
  without touching the part or its tests, and the part never learns of it.
