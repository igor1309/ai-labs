---
date: 2026-05-10
author: Igor Malyarov
version: 0.0.1
status: proposed
source_intent: dashboard-sync-agent — Intent (2026-05-10)
---

# ADR: Use a Specialized OpenClaw Agent for Dashboard and Loc-Script Sync

## Context

`ai-labs` is a mono-repo with multiple top-level projects.

Three repo surfaces drift from current repo state:

- `scripts/loc-dashboard.sh` — hardcodes the project list in three places (header comment, per-project loop, `known` list); a new project requires manual edits in all three.
- `docs/products.html` — hand-curated product cards (description, type, deployed URL, category placement) synthesized from each project's READMEs.
- `docs/loc-dashboard.html` — a `data = [...]` array of LOC numbers per project; refreshed mechanically from `scripts/loc-dashboard.sh` output.

`doc-drift-agent` already handles README drift (including the root `README.md` `## Components` table) on a daily cadence inside the existing OpenClaw runtime, but its hard constraint is "edit only READMEs."

## Decision

Use a new specialized OpenClaw agent — `dashboard-sync-agent` — sibling to `doc-drift-agent`. Reuse the existing running OpenClaw instance.

The agent will:

- inspect the repo's top-level project directories per a project-detection methodology authored alongside the agent definition (a simple "has a root `README.md`" rule is insufficient — many current projects do not)
- inspect each project's READMEs (root `README.md` and per-project READMEs where present)
- treat READMEs as the authoritative source of truth for `docs/products.html` card content; manual edits to `docs/products.html` are not preserved across runs
- compare `scripts/loc-dashboard.sh` against the current set of top-level project directories
- compare `docs/products.html` cards against the READMEs they describe, regenerating cards each run
- compare the `docs/loc-dashboard.html` `data = [...]` array against `scripts/loc-dashboard.sh` output
- short-circuit per-surface: skip surfaces with zero drift; if all three are clean, do nothing
- propose changes as a single PR per run; reuse a stable branch so re-runs update an existing PR rather than piling up duplicates

The agent must support:

- manual initiation
- scheduled sync at `0 18 * * *` UTC (daily)
- automated notifications when sync changes are proposed

The agent must never merge PRs automatically.

## Boundary

The agent's editable-file allowlist is exactly: `scripts/loc-dashboard.sh`, `docs/products.html`, `docs/loc-dashboard.html`, plus its own per-agent runtime state file under `~/.openclaw/agents/dashboard-sync-agent/` (mirroring `doc-drift-agent`'s state-file pattern). Any other write is a violation of the agent's contract.

The agent does not touch `README.md` (including the `## Components` table), per-project READMEs, log files, `release-units.config.toml`, or per-project CI workflows. README drift remains owned by `doc-drift-agent`; when this agent registers a new project in the three surfaces, `doc-drift-agent`'s next scheduled run flags the missing Components row through the normal README drift path.

The maintainer reviews proposed sync changes through the normal repo flow.

Sub-projects are out of scope; only top-level project directories (per the project-detection methodology referenced in the Decision section) are tracked.

## Consequences

Three drift-prone surfaces are kept in sync by a dedicated agent inside the existing OpenClaw instance, on a daily cadence distinct from `doc-drift-agent`'s.

Sync changes enter the same review path as normal repo changes.

Two agents run with disjoint editable-file allowlists; neither can write to the other's surface, eliminating overlap or contention.

The maintainer registers a new project by adding its directory; the next scheduled run of `dashboard-sync-agent` updates the script and dashboards (subject to the project-detection methodology), and the next scheduled run of `doc-drift-agent` flags the Components row gap.

## Non-goals

- Updating `README.md` `## Components` table — owned by `doc-drift-agent`.
- Updating logs (`docs/log.md`, `<project>/docs/log.md`) — human-authored.
- Tracking sub-projects below top-level — explicitly out of scope.
- Merging or approving PRs.
- Formatting, style, or structural rewrites on any surface.
