# ADR-006: A call loads its repository's instructions and skills

- **Status:** Accepted
- **Date:** 2026-09-30
- **Scope:** what an agent call loads from the repository it works in
- **Decision type:** Architecture
- **Amends:** [ADR-001](001-agister-cli-architecture.md): what a call is
  given besides its process's instruction and inputs

## Context

A repository's `AGENTS.md` and `CLAUDE.md` hold its conventions: how to
test, what is forbidden. Its skills hold how its recurring work is done.
An agent that does not see them breaks them. The runtimes load both
themselves when they run in the repository, unless told not to.

## Decision

A call runs its runtime so that the runtime loads the repository's
instruction files and skills as it would for a person working in the same
directory. Agister passes no flag that turns that loading off, and gives
the agent the tool it needs to use a skill.

## Consequences

- An agent follows the repository's conventions without the brief
  repeating them.
- What a call loads is whatever its runtime loads; Agister does not copy
  or filter it.
- A change to an instruction file or a skill changes later calls.
