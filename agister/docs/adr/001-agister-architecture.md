---
date: 2026-10-14
model: claude-opus-5-5
description: "ADR-001: Agister's architecture: what it is, its parts, their dependency rules and the invariants every part keeps"
---

# ADR-001: Agister's architecture

- **Status:** Proposed
- **Date:** 2026-10-14
- **Scope:** what Agister is, its parts and how they depend on one
  another, and the invariants every part keeps
- **Decision type:** Architecture

## Context

Agister's behaviours (verification, workflows, layering, holds and the
rest) each change for reasons of their own. Kept apart, each changes
without the others; that needs parts, rules for who may depend on whom,
and invariants that hold across them. This ADR fixes those; each
behaviour comes in an ADR of its own, in these parts' terms.

## Decision

Agister runs AI-agent work defined in settings files, through provider
runtimes, in the caller's git worktree, and keeps an attributable record of
every call.

## Parts

| Part | Responsibility |
|---|---|
| `cli` | Turns terminal commands into calls on the port it declares. The outer level; fails on bad input. The composition implements its port. |
| `settings/*` | The one owner of settings knowledge: where settings live (home, repository, project), how they are read, layered and resolved. Its primary operation is resolve ("can you resolve this?", "resolve this"). Resolve is the gate before a run: what resolves may run, what does not never reaches core. Check is built on resolve, which it is handed, and reports. Init, install, restore and the like use the same knowledge. Reads files through an abstract filesystem; the parser is internal. |
| `core/*` | Takes resolved settings and a run command, runs the work and streams run events. Declares the runtime protocol and the ports it needs. Knows no git and no files. |
| `runtime/<name>` | One wrapper per provider runtime (Claude Code, Codex, opencode, pi), with its own types. Knows nothing of core. |
| `git` | A wrapper over git, with its own types. Knows nothing of settings or core. |
| `runstore` | A wrapper that persists runs, with its own types. |
| `pages` | A read-only viewer of settings and runs. Its design is open (backlog). |
| `cmd/agister` | The composition root. |

## Rules

1. **No package of `cli`, `settings/*` or `core/*` imports another package
   of the module, inside its group or outside it.** Each declares its own types and
   the ports it requires. This includes `settings/check` and
   `settings/resolve`: check is handed resolve, it does not import it.
2. **Wrappers and adapters are different things.** A wrapper (a runtime,
   git, the run store) owns its types and knows nothing of the parts that use
   it. An adapter lives in the composition root, has no types of its own,
   and maps between a part's port and a wrapper, or between two parts.
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
5. **`--continue` resolves settings again**, like any call. The composition
   checks the continuation's conditions against the earlier
   runs (the session's latest run; the same worktree, repository and
   revision; the content as recorded) and hands core the session.
   Core reads no runs.
6. **Two file formats are contracts:** the settings files and the run
   records.

Rule 1 is enforced by an architecture test on import edges alone. When
something seems to need an import these rules forbid, the design is wrong,
not the rule: it gets a port.

## Invariants

Every part keeps these.

1. **Agister runs generic work.** It runs agent calls, the verification a
   process declares and the workflow shapes settings define. It knows no
   kind of work, no particular agent and no meaning of any output. It is a
   runner, not a guard: it checks whether settings resolve, never whether
   they should. A workflow that resolves may run; what it is granted is
   best effort (invariant 10).
2. **Definitions live in settings, not in code.** Agents, processes,
   workflows, output contracts, runtime mappings and what Agister tells
   an agent are defined in settings files, and changed without rebuilding.
   Code adds a mechanism only where settings cannot express it: a
   runtime, an input source kind.
3. **Every call ends in one result shape.** A status (completed, failed,
   interrupted, lost) and a failure class from a closed set. Completed
   means output valid against its contract; what the output says, an
   unfavourable verdict included, is not a status. Usage and cost as the
   runtime reports them, with their source: an unreported cost is
   unknown, never zero. Timing measured by Agister. The session the call
   ran in. Its warnings. A workflow ends in the same shape.
4. **Inputs are fixed before the first turn.** Each input is resolved to a
   value and its identity (a revision to its commit, content to its
   digest); that value is what the agent receives and what is recorded.
5. **Agister grants no permission meant to reach its state.** Home, its
   settings and its runs are not what any permission it grants is for. A
   repository's settings are the repository's files, like any other.
6. **The record is authoritative.** Per call it keeps the Agister identity
   apart from the provider session, the exact definitions with their
   digests, the inputs, the permission plan, the ordered events and the
   outcome. Everything Agister gave the call is in it. Diagnostics
   describe Agister's own machinery; they are not the record, and never
   change an argument, a result or an error.
7. **Every effect has an owner and an end.** Each process and hold a call
   creates is the call's, bounded, and ended on every exit path. A record
   whose call ended without finishing it reads as lost, never as running.
8. **Calls are independent.** Concurrent calls share only settings, which
   they read, records, each writing its own, and the worktree, through its
   hold. The exceptions are deliberate: a continuation resumes an earlier
   run's session, and a join receives its own workflow's outcomes.
9. **Agister is built to be changed.** The smallest design that does the
   work. A case is handled when it is met, not foreseen. A part that is
   hard to change is wrong, however much it covers.
10. **Agister acts on what settings declare, best effort.** A hold follows
    a process's declared access, and a plan is what Agister asks of the
    runtime. What a runtime, the repository or its setup grants or does
    beyond that is outside Agister: not explored, not enforced. Agister is
    no sandbox.

## Settings

Settings knows where settings live, what a file holds, how layers compose,
what each kind means, what references what, and how home is managed.

| Package | Responsibility | Ports it declares |
|---|---|---|
| `settings/layout` | Where settings live: selects home, the repository's and the nearest project's `.agister/`; maps a kind and name to its file; lists names. | filesystem (what is at a path, read, list, same directory); worktree root of a directory |
| `settings/documents` | Bytes to typed definitions with per-field provenance. Three components inside the package, each with its own unit tests: **format** (one document per file in its kind's format, unknown fields, schema version), **layering** (compose by field, `extends`, provenance), **kinds** (a composed tree to each kind's definition, with field problems). Its public interface has its own tests. | none: pure |
| `settings/resolve` | A request to resolved settings, or a refusal naming the chain. A request names any document by kind and name; a workflow or a process comes with its parameters. Resolve follows references, applies blocks, plans each node's permissions. | a document source; runtime facts (contracts, skills support), which the composition plugs in from the runtime wrappers |
| `settings/check` | Built on resolve: lists every document's name and resolves each, so a document nothing uses is checked too. Two views: **check** (every problem and what it refuses) and **inspect** (process, workflow and agent listings and shows, with provenance). | resolve; list names |
| `settings/home` | Writes into home: installing settings, with backups to restore from. | filesystem writes; clock |

The composition assembles the document source from `layout` and
`documents`, hands `check` a resolve. It plugs a
git-backed answer into `layout`'s worktree-root port: the root of the git
worktree that holds a directory, or none outside one. `layout` knows no git.

## Core

Core takes resolved settings (every node's process, agent, runtime mapping
and permission plan) and a run command (the workflow, its params, the
caller's limits, the earlier run's session for `--continue`), and gives a
stream of events and a result.

| Package | Responsibility | Ports it declares |
|---|---|---|
| `core/workflow` | Runs a workflow: one `call`, or `fan_out` then `join`; hands the join the collection (each node's status, class and output, in order); gathers the nodes' warnings. | run a call; events |
| `core/admit` | Admits a call before its first turn: the process and runtime allow what the command asks, and the worktree is held, as a writer alone or a reader shared. | worktree facts (revision, content), answered by the composition from `git`; hold; events |
| `core/session` | The conversation with the agent: turns on the runtime, each turn's output checked against its contract, and a recovery turn when a staleness limit ended one, while the budget allows. Declares the runtime protocol. | runtime protocol; staleness; events; clock |
| `core/attempts` | Verification and repair: runs the verification, and on a failure asks the session for a repair turn, while attempts are left. | verify; another turn of the session; events |
| `core/verify` | Runs a verification command: timeout, `no_output` staleness, bounded head and tail, digest. | command runner (the process supervisor); clock; timer |
| `core/inputs` | Resolves a call's inputs from their sources to a value and an identity; checks a text against its brief form; keeps long values as artifacts. | sources (by name, plugged in by the composition); artifact store |
| `core/watch` | Staleness limits on a turn: no event, a tool command, repeated identical tool calls. Observes the event stream and reports a limit reached; it ends nothing itself. | clock; timer |
| `core/trail` | What the agent touched and was denied. A pure observer of the event stream. | none: pure |

The composition chains `inputs`, `admit`, `session` and `attempts` into a
call, hands `workflow` that call, plugs `watch` and `trail` into the event
stream, and hands `watch`'s reports to `session`'s staleness port.

## Runs

Core emits its events. An adapter in the composition turns them into
`runstore`'s record, and `runstore` persists it. The composition knows
where runs are placed. Core reads no runs: the CLI's commands on runs
call `cli`'s port, which the
composition serves from `runstore`.

## Reaping

A call whose owner died may leave processes running and its hold taken.
The hold finds the dead owner, ends what that owner left running, and
only then is released. The owner's run reads as lost (invariant 7).

## A call

1. `cli` parses the command and calls its port.
2. The composition asks settings to resolve; a failure goes to stderr and no run
   is recorded.
3. For `--continue`, the composition checks the continuation against the earlier
   runs and takes its session.
4. Core gets the resolved settings and the command, drives a runtime wrapper
   through its protocol (an adapter maps between them), and streams events;
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
