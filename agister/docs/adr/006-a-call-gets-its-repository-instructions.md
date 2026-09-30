# ADR-006: A call gets its repository's instruction files

- **Status:** Accepted
- **Date:** 2026-09-30
- **Scope:** the instruction files an agent call receives
- **Decision type:** Architecture
- **Amends:** [ADR-001](001-agister-cli-architecture.md): what a call is
  given besides its process's instruction and inputs

## Context

A repository's `AGENTS.md` and `CLAUDE.md` hold its conventions: how to
test, what is forbidden. On 2026-09-30 two Claude implementers said they
had seen none of them: Agister starts Claude Code with `--restricted`,
which ignores project settings and with them the instruction files, and
one implementer did what the root `AGENTS.md` forbids. Codex loads the
root `AGENTS.md` itself.

## Decision

### 1. Every call gets the instruction files of its working directory

Each `AGENTS.md` and `CLAUDE.md` from the repository root down to the
call's working directory, root first. Where the runtime does not load them
itself under Agister's flags, Agister gives them to the model ahead of the
process's instruction. A file that cannot be read fails the call before it
starts.

### 2. The run records what the call received

Each instruction file's path and digest is on the run, so what an agent
was told can be read back.

## Consequences

- An agent follows the repository's conventions without the brief
  repeating them.
- Confinement stays as it is: `--restricted` keeps ignoring settings and
  hooks; only the instruction files come back.
- A change to an instruction file changes every later call; the recorded
  digests show which version a run had.
