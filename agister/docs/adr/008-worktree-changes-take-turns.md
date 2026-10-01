# ADR-008: Worktree changes take turns

- **Status:** Accepted
- **Date:** 2026-10-01
- **Scope:** concurrent calls that add and remove checkouts of one
  repository
- **Decision type:** Architecture
- **Amends:** [ADR-001](001-agister-cli-architecture.md) rule 12

## Context

ADR-001 rule 12 lets no call depend on another's state, with the deliberate
exceptions it and [ADR-003](003-fan-out-and-join-workflow.md) name. Git
worktree commands that run at the same time in one repository can fail on
each other's half-written records, whether the calls run in one Agister
process or in several.

## Decision

1. Concurrent calls that share Agister's state directory take turns for
   the git worktree commands that add and remove their checkouts.
2. They take turns through one lock file per repository, keyed by its git
   common directory, under that state directory.
3. The lock file holds no state, and no call reads another's.
4. Nothing is written in the repository or its `.git` for the turns.
5. A cleanup's wait on the lock is bounded.

## Amendments to ADR-001

- Rule 12 adds a deliberate exception: concurrent calls take turns on a
  repository's worktree commands, as this ADR's rules say.

## Consequences

- Checkouts of one repository made and removed at the same time no longer
  fail on each other.
- A call waits while another holds its repository's lock; a cleanup whose
  wait reaches its bound ends with an error.

## Limitation

Calls with different `--home` values do not coordinate.
