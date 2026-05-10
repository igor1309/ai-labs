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
- `docs/products.html` — hand-curated product cards (description, type, deployed URL, category placement); content derives from the root `README.md` `## Components` table and per-project READMEs.
- `docs/loc-dashboard.html` — a `data = [...]` array of LOC numbers per project; refreshed mechanically from `scripts/loc-dashboard.sh` output.

`doc-drift-agent` already handles README drift (including the root `README.md` `## Components` table) on a daily cadence inside the existing OpenClaw runtime, but its hard constraint is "edit only READMEs."

## Decision

Use a new specialized OpenClaw agent — `dashboard-sync-agent` — sibling to `doc-drift-agent`. Reuse the existing running OpenClaw instance.

The agent will:

- treat `README.md`'s `## Components` and `## Structure` tables as the authoritative registries for what counts as a project; the union of their entries (filtered to those whose name maps to a top-level directory) is the tracked set
- treat the `## Components` table as authoritative for `docs/products.html` card content (`Name`, `Type`, `Description` columns), reading per-project READMEs only for enrichment fields such as a deployed URL
- regenerate `docs/products.html` cards from `## Components` each run; manual edits to `docs/products.html` are not preserved
- compare the `scripts/loc-dashboard.sh` per-project loop, header comment, and `known` list against the tracked set; surface top-level directories present in the repo but absent from both registries as "candidates for Components or Structure registration" in the PR description rather than silently adding or dropping them
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

The agent does not touch `README.md` (including the `## Components` and `## Structure` tables), per-project READMEs, log files, `release-units.config.toml`, or per-project CI workflows. README drift remains owned by `doc-drift-agent`. The Components/Structure tables flow one way: maintainer (or `doc-drift-agent`) edits the table → `dashboard-sync-agent` propagates to the three surfaces.

The maintainer reviews proposed sync changes through the normal repo flow.

Sub-projects are out of scope; only top-level project directories present in `## Components` or `## Structure` are tracked. Sub-components in `## Components` (entries whose name does not map to a top-level directory, e.g. `notio-backend`, `docker/langfuse`) are skipped by the agent.

## Consequences

Three drift-prone surfaces are kept in sync by a dedicated agent inside the existing OpenClaw instance, on a daily cadence distinct from `doc-drift-agent`'s.

Sync changes enter the same review path as normal repo changes.

Two agents run with disjoint editable-file allowlists; neither can write to the other's surface, eliminating overlap or contention.

The maintainer registers a new project by adding a row to `## Components` (or `## Structure` for workspace dirs); the next scheduled run of `dashboard-sync-agent` updates the script and dashboards.

## Non-goals

- Updating `README.md` `## Components` table — owned by `doc-drift-agent`.
- Updating logs (`docs/log.md`, `<project>/docs/log.md`) — human-authored.
- Tracking sub-projects below top-level — explicitly out of scope.
- Merging or approving PRs.
- Formatting, style, or structural rewrites on any surface.
