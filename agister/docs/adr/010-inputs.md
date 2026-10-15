---
date: 2026-10-14
model: claude-opus-5-5
description: "ADR-010: inputs: each input is resolved once from a named source to a value and its identity, kept with the run, and a text may be checked against a brief form"
---

# ADR-010: Inputs

- **Status:** Accepted
- **Topic:** Running work
- **Date:** 2026-10-14
- **Scope:** what a call is given besides its prompt, where it comes from,
  what is kept of it, and the check a brief's text may get
- **Decision type:** Architecture
- **Amended by:** ADR-011 (2026-10-15)

## Context

A call's work starts from what the caller hands in and from facts about
the worktree: a brief, a goal, a revision, the files a change touched.
Each must be fixed before the primitive starts, the same for every
primitive that shares it, and kept so the call can be understood after
the caller's copy is gone.

## Decision

A workflow declares its inputs at its boundary, and a process or a
command its own, each from a named source or a binding. `core/inputs`
resolves them before the primitive starts to a value and its identity,
through a port for each source that the composition answers. The run
keeps what each primitive was given. A text may be checked against a
brief form.

## Rules

### 1. A workflow, a process and a command declare their inputs

Each names its inputs, the source each comes from and what the source
takes, such as a param the caller gives. A source is a kind of code, not
of settings (ADR-001, invariant 2): a param, a file, a revision, the
changed files between two revisions. A binding gives a child a value
from its workflow's inputs, an earlier result or repetition state.

An agent receives its inputs in what it is told. A command receives
them in its command and its environment, where it declares them.

### 2. Sources are ports

`core/inputs` knows no file and no git. Each source is a port it
declares, and the composition answers it: from the caller's params, from
the filesystem, from `git`.

### 3. Inputs are resolved once, before the primitive starts

Each input is resolved to a value and its identity (ADR-001,
invariant 4), once, before the primitive that takes it starts; an input
shared by parallel children once, before they start.
An input that cannot be resolved refuses the primitive before it
starts.

### 4. The run keeps what it was given

The record holds every input with its identity, and the run keeps the
bytes each primitive received, however long. The caller's copy, a file under
a temporary folder or one that later changes, is not what explains the
call.

### 5. A brief form checks structure, never meaning

A text input may name the brief forms its text may take; a form is a
settings document (ADR-002, rule 1). A text that takes none of them is
refused before the primitive starts, naming what is wrong. Agister does not
write, judge or repair a brief.

## Consequences

- A call can be understood from its run alone, whatever happened to the
  caller's files.
- Git reaches inputs only through the composition; core stays without
  it.
- A new kind of source is code: a port answer in the composition, and
  its name in the settings.
