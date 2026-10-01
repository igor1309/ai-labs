# ADR-009: Pages reads settings and runs directly

- **Status:** Accepted
- **Date:** 2026-10-01
- **Scope:** `agister pages`, the local page of settings and runs
- **Decision type:** Architecture
- **Amends:** [ADR-001](001-agister-cli-architecture.md) rule 15 and
  invariant 14

## Context

ADR-001 rule 15 lets the CLI depend only on the client contract and read no
settings, records or runtimes directly; invariant 14 says the same of the
one CLI surface. `agister pages` serves a page on this machine that shows
the settings a repo uses and the runs under Agister home. It reads the
settings files and run records from disk, not through the client contract.
It submits, cancels and changes nothing.

## Decision

1. `agister pages` is a viewer, not a client of the core: it reads settings
   files and run records directly and does not use the client contract.
2. It only reads. It submits, cancels, continues and changes no call, run,
   setting or effect.
3. It serves on the loopback address only, to requests addressed to this
   machine.
4. Its reading of run records takes their ownership state from the run
   store, so it reports an unfinished run as the store does.

## Amendments to ADR-001

- Rule 15 and invariant 14 do not govern `agister pages`, within this ADR's
  rules. Every other command still depends only on the client contract.

## Consequences

- The page shows settings and runs without the contract having to carry
  listing, raw records or settings files.
- When the service arrives (ADR-001 rule 16), the page reads what is on
  this machine's disk, not what the service holds; a page of a service's
  runs would need the contract.
