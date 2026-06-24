---
date: 2026-06-24
model: claude-opus-4-8
version: 0.0.1
description: "Forward task: surface nested agent definitions under agents/ as individual product cards."
---

# Backlog — surface nested agents on the products page

The dashboard-sync-agent emits product cards only from **top-level** Components
rows ([`dashboard-sync-agent/agent/project-registry.md`](../dashboard-sync-agent/agent/project-registry.md)).
Agent definitions nested under `agents/` therefore get no cards:

- `agents/doc-drift-agent`
- `agents/maestro-flow-review-agent`

Only `dashboard-sync-agent` (a top-level dir) and the umbrella `agents` row appear
in the **Agents** group. The umbrella card ("OpenClaw agent-fleet operational docs
and nested specialized agent definitions") stands in for a folder, not a product.

## Task

Teach the agent to enumerate nested agent definitions and emit one card per agent.

- Decide the registry mechanism: per-nested-agent Components rows (keyed e.g.
  `agents/doc-drift-agent`) versus a generation rule that walks `agents/*` for agent
  definitions. The current registry maps keys to top-level dirs, so nested keys need
  explicit handling.
- Emit a card per nested agent under the **Agents** group, sourced from each agent's
  own `README.md` (name, description, optional stack, optional `Landing page:`).
- Decide the fate of the umbrella `agents` card: drop it (exclude the dir) once the
  individual agents render, or keep it as a group lead-in.
- Reflect any change in both [`project-registry.md`](../dashboard-sync-agent/agent/project-registry.md)
  and [`synthesis-spec.md`](../dashboard-sync-agent/agent/synthesis-spec.md); confirm
  `scripts/loc-dashboard.sh` and its tests still pass (nested agent dirs currently roll
  up into the `agents` top-level LOC row).

## Open questions

- Should nested agents count as their own LOC rows, or keep rolling up under `agents`?
