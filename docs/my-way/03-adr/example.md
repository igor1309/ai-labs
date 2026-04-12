---
title: ADR — Example
date: 2026-04-12
author: Igor Malyarov
version: 0.0.1
format: example
source: condensed from docs/adr/release/ADR-001-independent-release-units.md
---

# ADR — Example

The example below is condensed from a real ADR.

---

```markdown
---
date: 2026-02-27
model: gpt-5.2
description: "Independent release units and trunk-only release policy"
---

# ADR-001 — Independent Release Units & Trunk Policy

## Executive summary

Each release unit is versioned and released independently. Releases
occur only from `trunk`. Release branches are prohibited.

## Context

Multiple products exist within a single repository. A coupled release
train would introduce unnecessary blocking and coordination risk.
Products evolve at different speeds — Oracle ships weekly, Loki ships
monthly, Nomos ships on-demand.

Alternatives considered:
- **Global version**: rejected — forces lockstep releases across
  unrelated products.
- **Release branches**: rejected — introduces merge coordination
  overhead with no benefit at current team size.

## Decision

Adopt independent versioning per release unit. Adopt trunk-only
release policy.

## Rules / invariants

- Each release unit MUST have its own version.
- Releases MUST trigger only on push to `trunk`.
- Release branches MUST NOT be used.
- A version bump MUST be the explicit signal of release intent.
- Tag format MUST follow `<basename>_v<version>`.

## Consequences

- Parallel evolution is enabled — units ship on their own cadence.
- No global version exists — consumers must reference unit versions
  individually.
- Release isolation is guaranteed — a broken unit does not block
  others.
- CI must validate each unit independently.

## Non-goals

- Global release train versioning.
- Changelog enforcement (deferred).
- Commit convention enforcement (deferred).
```
