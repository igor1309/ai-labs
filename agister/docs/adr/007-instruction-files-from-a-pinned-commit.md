# ADR-007: Instruction files come from a pinned commit, and a join gets them

- **Status:** Accepted
- **Date:** 2026-09-30
- **Scope:** where a call's instruction files are read from, and which
  calls get them
- **Decision type:** Architecture
- **Amends:** [ADR-006](006-a-call-gets-its-repository-instructions.md)
  rule 1: the files are read from a commit, not the working tree; rule 2:
  the run also records that commit.
  [ADR-003](003-fan-out-and-join-workflow.md) rule 4: a join also gets
  the instruction files

## Context

ADR-006 gives every call its repository's `AGENTS.md` and `CLAUDE.md`
files, read from the working tree. A working tree changes under a call:
an agent edits an instruction file, or someone edits it by hand, and what
a run was told cannot be read back from the repository. A join, such as a
review judge, has no checkout, and ADR-003 rule 4 gives it nothing beyond
its collection and fixed values, yet its rulings depend on the
repository's rules.

## Decision

### 1. The files come from a pinned commit

A call with a checkout reads the instruction files from its checkout's
commit; a call without one reads them from the repository's `HEAD`,
resolved when the call starts. The set is as ADR-006 rule 1 names it:
each `AGENTS.md` and `CLAUDE.md` from the repository root down to the
call's working directory, root first. Uncommitted edits reach no call,
and an agent that edits an instruction file does not change what its
later turns receive.

### 2. A join gets them too

The instruction files are the repository's own rules, not material from
the workflow's caller, so a join receives them as any call does. This
amends ADR-003 rule 4.

### 3. The run records the commit

Besides each file's path and digest (ADR-006 rule 2), the run records the
commit the files were read from.

## Consequences

- What a run was told can be read back from the repository by its
  commit.
- An instruction-file change reaches calls once it is committed.
- A join's rulings rest on the repository's rules, as its fan-out
  nodes' work does.
