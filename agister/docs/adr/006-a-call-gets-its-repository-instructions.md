# ADR-006: A call gets its repository's instruction files

- **Status:** Accepted
- **Date:** 2026-09-30
- **Scope:** the instruction files an agent call receives
- **Decision type:** Architecture
- **Amends:** [ADR-001](001-agister-cli-architecture.md): what a call is
  given besides its process's instruction and inputs;
  [ADR-003](003-fan-out-and-join-workflow.md) rule 4: a join also gets
  them

## Context

A repository's `AGENTS.md` and `CLAUDE.md` hold its conventions: how to
test, what is forbidden, how work is judged. On 2026-09-30 two Claude
implementers said they had seen none of them: Agister starts Claude Code
with `--restricted`, which ignores project settings and with them the
instruction files, and one implementer did what the root `AGENTS.md`
forbids. Codex loads the root `AGENTS.md` itself, from whatever the
working tree holds.

## Decision

### 1. Every call gets the instruction files of a pinned commit

Each `AGENTS.md` and `CLAUDE.md` from the repository root down to the
call's working directory, root first, as committed: a call with a checkout
reads them from its checkout's commit; a call without one, such as a
join, from the repository's `HEAD` when the call starts. Agister gives
them to the model ahead of the process's instruction. Uncommitted edits
reach no call, and an agent that edits an instruction file does not
change what its later turns receive.

### 2. A join gets them too

The instruction files are the repository's own rules, not material from
the workflow's caller, so a join receives them as any call does (amending
ADR-003 rule 4). A join's rulings depend on those rules.

### 3. The run records what the call received

The commit, and each file's path and digest: what an agent was told can
be read back from the repository.

## Consequences

- An agent follows the repository's conventions without the brief
  repeating them.
- Confinement stays as it is: `--restricted` keeps ignoring settings and
  hooks; only the instruction files come back.
- An instruction-file change reaches calls once it is committed.
