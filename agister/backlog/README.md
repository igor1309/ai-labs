---
date: 2026-09-29
model: claude-opus-5-5
description: "Index of Agister's forward-task backlog: product ideas not yet planned."
version: 0.1.0
---

# Backlog

Forward tasks only: never session status, done-markers or findings. Known
gaps in what Agister already does live in [`../docs/deferred.md`](../docs/deferred.md);
this is for what it might do next. Promote a topic to its own
`backlog/<topic>.md` once it reaches roughly three items.

## Uncategorized items

### `agister audit`: show what the settings will do

Agister is a runner and does not judge settings (README, Settings;
ADR-001 rule 1). A separate command could lay them out so you can judge
them yourself: for each agent and process, the effective model, effort,
budgets (time, cost, attempts), permissions granted and withheld, the
runtime command it names, and which layer (project or global) each value
comes from. That would show at a glance a setup that is expensive, or one
too constrained for its task.

- It reports and does not refuse or rank. Deciding what is right stays
  with you.
- `check` already composes the effective settings, so it is one possible
  place to build on.
