---
date: 2026-10-14
model: claude-opus-5-5
description: "Agister top-level architecture: parts, dependency rules, settings, core, runs"
---

# Agister: top-level architecture (proposal)

Agister runs AI-agent work that is defined as settings, through provider
runtimes, in the caller's git worktree, and keeps an attributable record of
every call.

## Parts

| Part | Responsibility |
|---|---|
| `cli` | Turns terminal commands into calls on the port it declares (run, observe, cancel, check, inspect, list, show, export). The outer level; fails on bad input. The composition implements its port. |
| `settings/*` | The one owner of settings knowledge: where settings live (home, repository, project), how they are read, layered and resolved. Its primary operation is resolve ("can you resolve this?", "resolve this"). Check is built on resolve; the gate before a run is that check. Init, install, restore and the like use the same knowledge. Reads files through an abstract filesystem; the parser is internal. |
| `core/*` | Takes resolved settings and a run command, runs the work and streams run events. Declares the runtime protocol and the ports it needs. Knows no git and no files. |
| `runtime/<name>` | One wrapper per provider runtime (Claude Code, Codex, opencode, pi), with its own types. Knows nothing of core. |
| `git` | A wrapper over git, with its own types. Knows nothing of settings or core. |
| `runstore` | A wrapper that persists runs, with its own types. |
| `pages` | Renders settings and runs from their files. Reads them directly. |
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
   placement. Settings' resolve output and core's input are two
   types; the composition maps one to the other. What it builds behind
   `cli`'s port is handed a `resolve func(ctx) (core.Settings, error)`: it
   resolves, then runs. The CLI sees neither.
4. **Settings are resolved before a run.** Settings that cannot be resolved
   never reach core: no run is recorded, and the composition reports the
   failure on stderr, as for a bad command. Only what core emits is recorded, so a
   refusal after resolution (a held worktree, admission) is recorded. Core
   never reads settings files.
5. **`--continue` resolves settings again**, like any call. The composition
   checks the continuation's conditions against the earlier
   runs (the session's latest run; the same worktree, repository and
   revision; the content and patch as recorded) and hands core the session.
   Core reads no runs.
6. **Two file formats are contracts:** the settings files and the run
   records. Pages reads both; its tests fail when either changes.

Rule 1 is enforced by an architecture test on import edges alone.

## Settings

Settings knows where settings live, what a file holds, how layers compose,
what each kind means, what references what, and how home is managed.

| Package | Responsibility | Ports it declares |
|---|---|---|
| `settings/layout` | Where settings live: selects home, the repository's and the nearest project's `.agister/`; judges a layer's validity; maps a kind and name to its file; lists names; finds `layer.yaml`'s prompt folders. | filesystem (what is at a path, read, list, same directory); worktree root of a directory |
| `settings/documents` | Bytes to typed definitions with per-field provenance. Three components, each with its own unit tests: **format** (one YAML document, unknown fields, schema version), **layering** (compose by field, `extends`, provenance), **kinds** (a composed tree to each kind's definition, with field problems). Its public interface has its own tests. | none: pure |
| `settings/resolve` | A request to resolved settings, or a refusal naming the chain. A request names any document by kind and name; a workflow or a process comes with its parameters. Resolve follows references, applies blocks, checks limits against ceilings, plans each node's permissions. | a document source; runtime facts (contracts, skills support), which the composition plugs in from the runtime wrappers |
| `settings/check` | Built on resolve: lists every document's name and resolves each, so a document nothing uses is checked too. Two views: **check** (every problem and what it refuses, the tree view, the newer-binary hint; the gate before a run) and **inspect** (process, workflow and agent listings and shows, with provenance). | resolve; list names |
| `settings/home` | Writes: init, install, restore, retire, backups, agent create. A write is refused if it adds a problem. | filesystem writes; clock; check of the staged result |

The composition assembles the document source from `layout` and
`documents`, hands `check` a resolve, and hands `home` a check. It plugs a
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
| `core/admit` | Admits a call before its first turn: the process and runtime allow what the command asks (a resumable session for `--continue`), and the worktree is held, as a writer alone or a reader shared. | hold; events |
| `core/session` | The conversation with the agent: turns on the runtime, and a recovery turn when a staleness limit ended one, while the budget allows. Declares the runtime protocol (turn request, tool and denial events, result, capabilities). | runtime protocol; events; clock |
| `core/attempts` | Verification and repair: runs the verification, and on a failure asks the session for a repair turn, while attempts are left. | verify; another turn of the session; events |
| `core/verify` | Runs a verification command: timeout, `no_output` staleness, bounded head and tail, digest. | command runner (the process supervisor) |
| `core/inputs` | Resolves a call's inputs from their sources to a value and an identity; checks a text against its brief form; keeps long values as artifacts. | sources (by name, plugged in by the composition); artifact store |
| `core/watch` | Staleness limits on a turn: no event, a tool command, repeated identical tool calls. A pure observer of the event stream. | none: pure |
| `core/trail` | What the agent touched and was denied. A pure observer of the event stream. | none: pure |

The composition chains `admit`, `session` and `attempts` into a call, hands
`workflow` that call, and plugs `watch` and `trail` into the event stream.

## Runs

Core emits its events. An adapter in the composition turns them into
`runstore`'s record, and `runstore` persists it. The composition knows
where runs are placed. Core reads no runs: the CLI's runs
commands (list, show, watch, export) call `cli`'s port, which the
composition serves from `runstore`. Pages reads the
files.

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

The composition connects parts with two kinds of small types, each tested
alone.

- **Adapters** map a part's port onto a wrapper, or onto another part's
  port, and own no types. Why: each side keeps its own words, a change on
  one side changes only the adapter, and each side is tested without the
  other.
- **Decorators** wrap a port with the same port and add one concern:
  diagnostics, logging, run placement, reporting a settings failure on
  stderr, checking a continuation. Why: a concern is added or removed
  without touching the part or its tests, and the part never learns of it.

## To consider later

- **Git-backed behaviour outside core.** Where each goes, the composition
  or nowhere: the pinned revision, the clean-worktree check, the changes
  patch and the rebuild check after a verification, detecting an agent's
  commit, the git roots and submodules in hold overlap, and the git input
  sources (revision, merge-base, diff, changed files).
- **Where reaping lives.** Reaping a run whose owner died: in the hold, or
  with runs.
