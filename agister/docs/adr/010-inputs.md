---
date: 2026-10-14
model: claude-opus-5-5
description: "ADR-010: inputs: each input is resolved once from a named source to a value and its identity, kept with the run, and a text may be checked against a brief form"
---

# ADR-010: Inputs

- **Status:** Accepted
- **Topic:** Running work
- **Date:** 2026-10-14
- **Scope:** what a workflow and each of its steps are given besides a
  prompt, where it comes from, what is kept of it, and the
  check a brief's text may get
- **Decision type:** Architecture
- **Amended by:** ADR-011 (2026-10-15), ADR-012 (2026-10-15)

## Context

A workflow's work starts from what the caller hands in and from facts
about the worktree: a brief, a goal, a revision, the files a change
touched. Its steps take those values and earlier results. Each must be
fixed before the call that takes it starts, the same for every call that
shares it, and kept so the run can be understood after the caller's
copy is gone.

## Decision

A workflow declares its inputs at its boundary, and a process its own,
each from a named source or a binding. `core/inputs` resolves them
before the call starts to a value and its identity, through a port for
each source that the composition answers. The run keeps what each call
was given. A text may be checked against a
brief form.

## Rules

### 1. A workflow and a process declare their inputs

Each names its inputs, the source each comes from and what the source
takes, such as a param the caller gives. A source is a kind of code, not
of settings (ADR-001, invariant 2): a param, a file, a revision, the
changed files between two revisions. A binding gives a child a value
from its workflow's inputs, an earlier result or repetition state.

A runtime takes a call's inputs in its own way, one of its facts
(ADR-003, rule 7): a model in what it is told, bash in the script's
environment.

### 2. Sources are ports

`core/inputs` knows no file and no git. Each source is a port it
declares, and the composition answers it: from the caller's params, from
the filesystem, from `git`.

### 3. Inputs are resolved once, before the call starts

Each input is resolved to a value and its identity (ADR-001,
invariant 4), once, before the call that takes it starts; an input
shared by parallel children once, before they start. An input that
cannot be resolved refuses the call before it starts.

### 4. The run keeps what it was given

The record holds every input with its identity, and the run keeps the
bytes each call received, however long. The caller's copy, a file
under a temporary folder or one that later changes, is not what explains
the run.

### 5. A brief form checks structure, never meaning

A text input may name the brief forms its text may take; a form is a
settings document (ADR-002, rule 1). A text that takes none of them is
refused before the call starts, naming what is wrong. Agister does not
write, judge or repair a brief.

## Consequences

- A run, and each call in it, can be understood from the record
  alone, whatever happened to the caller's files.
- Git reaches inputs only through the composition; core stays without
  it.
- A new kind of source is code: a port answer in the composition, and
  its name in the settings.
