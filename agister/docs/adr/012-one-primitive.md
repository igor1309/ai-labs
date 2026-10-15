---
date: 2026-10-15
model: claude-opus-5-5
description: "ADR-012: one primitive: a process invoked on an agent; a command is a process on the bash runtime"
---

# ADR-012: One primitive

- **Status:** Proposed
- **Topic:** Running work
- **Date:** 2026-10-15
- **Scope:** the primitive a workflow runs, the runtimes it runs on, and
  what a runtime can and cannot do
- **Decision type:** Architecture
- **Amends:** ADR-001, ADR-002, ADR-003, ADR-004, ADR-010 and ADR-011

## Executive Summary

A workflow runs one primitive: a process invoked on an agent. Bash is a
runtime like Claude Code and Codex, so a command is a process on an
agent whose runtime is bash. What differs between agents and commands
becomes what a runtime can do, which resolve already checks.

## Context

ADR-011 names two primitives, an agent invocation and a command
execution. Its amendments already give them one result shape, the same
limits, the same admission and holds, the same inputs and the same
records. What remains apart is a second port on `core/workflow`, a
second chain in the composition, and `core/command`, which starts,
streams, limits and ends a program as each runtime wrapper does.

Claude Code under `claude -p` and Codex under `codex exec` are each a
program that streams events until it ends. So is bash. ADR-003 already
treats runtimes as unequal: whether one resumes, takes skills or
accepts an effort is a fact resolve checks.

## Decision

The primitive is an invocation: a process bound to an agent, run on the
agent's runtime. Bash is a runtime, with its wrapper, its mapping and
its facts. A command is a process whose agent's runtime is bash. The
command execution goes, with its port, its chain and `core/command`.

## Rules / Invariants

### 1. One primitive

A workflow's child is an invocation or a named workflow. An invocation
binds a process to an agent; the agent names the runtime. `core/workflow`
declares one port, to invoke, and never learns the runtime.

### 2. Bash is a runtime

A bash agent names the bash runtime and no model. A bash process's
prompt is the script bash runs; its inputs reach the script in its
environment, as the process declares. Every other runtime is told its
inputs in what the agent is told.

The bash runtime runs the script once. Its output is the exit code,
stdout and stderr, and that is its contract: the invocation completes
whatever the exit code, and conditions read it (ADR-011, rule 5). It
reports no cost, which is unknown, and no session.

### 3. A runtime's facts say what it can do

The facts resolve reads (ADR-003, rule 7) include what a runtime
reports: tool calls, cost, a session it can resume, skills it takes.
An invocation that needs what its runtime cannot do is refused at
resolve: a bound or recovered session, skills, a staleness limit on
tool calls, on a runtime that reports none of them.

### 4. Every invocation is planned

A runtime mapping may name what its runtime grants with no option. The
bash mapping grants by default what its environment gives; it offers no
options. Resolve plans a bash invocation as any other (ADR-003, rule 4):
a required permission the mapping cannot give refuses it; what it
grants beyond what the process allows is a warning. The plan is what
Agister asks; bash, like every runtime, is not confined (ADR-001,
invariant 10).

### 5. One supervisor runs every runtime's program

`supervisor` is a wrapper that starts a program in a directory with an
environment, streams its output, ends its process group on every exit
path and reaps what a dead owner left. Every runtime wrapper runs its
program through it. A turn's `no_output` and no-event staleness are one
limit, observed by `core/watch` on any runtime.

### 6. Core runs a conversation on every runtime

`core/session` drives every invocation: turns on the runtime, the
output checked against its contract, a recovery turn where the runtime
resumes. On bash an invocation has one turn. The composition chains
`inputs`, `admit` and `session` into an invocation and hands it to
`core/workflow`.

## Consequences

- A new kind of program to run is a runtime: a wrapper, its mapping and
  its facts. No primitive, port or kind is added.
- A process's access decides its hold whatever its runtime: a bash
  process that writes is a writer (ADR-004, rule 3).
- `verify`-like work is a process on a bash agent, named and reused like
  any process.
- Adoption amends ADR-001 (invariants 1, 3, 4, 6 and 10; the parts, with
  `runtime/bash` and `supervisor`; the core table, without
  `core/command`), ADR-002 (rule 5), ADR-003 (rules 3, 4 and 7), ADR-004
  (rules 2, 3 and 7), ADR-010 (rule 1) and ADR-011 (decision, rules 1, 5
  and 6).

## Non-Goals

- A schema over a bash process's stdout. Handled when a workflow needs
  it.
- Settings syntax for a bash agent and process; `settings/documents`
  specifies it, as ADR-011 leaves syntax out.
