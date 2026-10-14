---
date: 2026-10-14
model: claude-opus-5-5
description: "ADR-010: inputs: each input is resolved once from a named source to a value and its identity, kept with the run, and a text may be checked against a brief form"
---

# ADR-010: Inputs

- **Status:** Proposed
- **Date:** 2026-10-14
- **Scope:** what a call is given besides its prompt, where it comes from,
  what is kept of it, and the check a brief's text may get
- **Decision type:** Architecture

## Context

A call's work starts from what the caller hands in and from facts about
the worktree: a brief, a goal, a revision, the files a change touched.
Each must be fixed before the agent starts, the same for every node that
shares it, and kept so the call can be understood after the caller's
copy is gone.

## Decision

A process declares its inputs, each from a named source. `core/inputs`
resolves them before the first turn to a value and its identity, through
a port for each source that the composition answers. The run keeps what
the agent was given. A text may be checked against a brief form.

## Rules

### 1. A process declares its inputs

A process names each input, the source it comes from and what the source
takes, such as a param the caller gives. A source is a kind of code, not
of settings (ADR-001, invariant 2): a param, a file, a revision, the
changed files between two revisions.

### 2. Sources are ports

`core/inputs` knows no file and no git. Each source is a port it
declares, and the composition answers it: from the caller's params, from
the filesystem, from `git`.

### 3. Inputs are resolved once, before the first turn

Each input is resolved to a value and its identity (ADR-001,
invariant 4), once per call, or once for a fan-out's nodes (ADR-007,
rule 3). An input that cannot be resolved refuses the call before its
first turn.

### 4. The run keeps what it was given

The record holds every input with its identity, and the run keeps the
bytes the agent received, however long. The caller's copy, a file under
a temporary folder or one that later changes, is not what explains the
call.

### 5. A brief form checks structure, never meaning

A text input may name the brief forms its text must have; a form is a
settings document (ADR-002, rule 1). A text that has none of them is
refused before the first turn, naming what is wrong. Agister does not
write, judge or repair a brief.

## Consequences

- A call can be understood from its run alone, whatever happened to the
  caller's files.
- Git reaches inputs only through the composition; core stays without
  it.
- A new kind of source is code: a port answer in the composition, and
  its name in the settings.
