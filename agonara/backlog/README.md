---
date: 2026-06-20
model: gpt-5
description: "Index of Agonara's forward-task backlogs, split by topic under backlog/."
version: 0.1.0
---

# Backlog

Forward tasks only — never session status, done-markers, per-item progress, or
findings. Completed work drops out of the list; its record lives in git history,
the produced artifacts, and `docs/log.md`.

Backlogs are split by topic so each concern stays discoverable on its own:

- [`dev-skills.md`](dev-skills.md) — agent process, skill, and toolchain
  improvements.
- [`skills.md`](skills.md) — the BYOA operator-skill product: distribution,
  versioning, and discovery of the per-role operator skills.
- [`agent-connectivity.md`](agent-connectivity.md) — making an instance reachable
  by the agents people actually use (Telegram bots, Claude Code on web/app, other
  MCP or HTTP agents).
- [`workflow-calibration-gaps.md`](workflow-calibration-gaps.md) — calibrating the
  `traceability-review` dynamic workflow, using Agonara as the eval corpus.

Promote a topic to its own `backlog/<topic>.md` file when it is a distinct
concern that has reached roughly three or more items or is clearly going to grow;
keep small or uncategorized items in this index until then.

## Uncategorized items

Single items not yet promoted to a topic file.

- **Authorized deletion of corpus sources (and program lifecycle).** Source
  records are append-only: no role has a delete via the API, and Program
  archival/deletion/ownership transfer are explicitly not exposed
  (`docs/specs/corpus-storage-and-curator-acceptance-api.md` #65/#66;
  `corpus-storage-and-curator-acceptance-first-slice.md` #37/#44). Decide, via an
  ADR, whether to add a **curator-authorized** source-removal (and/or program
  archival) operation with audit-preserving semantics. Until then, stray or test
  sources can only be removed by host-level DB surgery, which overrides the
  append-only design.

## Design-reasoning companions

Not task lists, so exempt from the forward-tasks-only rule above: longer-form
design exploration that explains *why* a backlog's tasks exist. Kept beside the
backlog they inform.

- [`agenticops-affordances.md`](agenticops-affordances.md) — which AgenticOps
  platform ideas are worth adopting for Agonara; the reasoning behind the
  self-describing-API and platform-owns-process tasks in [`skills.md`](skills.md).

## Under consideration

Documents parked in an `under-consideration/` folder need an owning decision before downstream docs are revised. Do not let that folder go stale.

No active under-consideration documents.

When a parked document is resolved, move it out of `under-consideration/` (into `agonara/docs/` for accepted direction, or `archive/` if rejected) and log the decision in `agonara/docs/log.md`.
