---
date: 2026-06-01
model: claude-opus-4-8
description: "Intent for dashboard-sync-agent: a sibling OpenClaw agent that keeps scripts/loc-dashboard.sh, docs/products.html, and the docs/loc-dashboard.html data array in sync with repo state on a daily 01:30 UTC cron"
---

# dashboard-sync-agent — Intent

A specialized OpenClaw agent that runs daily at 01:30 UTC and keeps three repo surfaces in sync with current repo state. Sibling to `doc-drift-agent`: same runtime pattern (workspace sync, `AGENTS.md` system prompt, cron wrapper, Telegram notifier, PR-only output), distinct scope and editable-file allowlist.

## Surfaces in scope

The agent edits exactly three files. The source of truth for what counts as a project is `README.md`'s `## Components` and `## Structure` tables — registries the maintainer edits explicitly when adding or removing a project.

1. `scripts/loc-dashboard.sh` — the `ROW PROJECTS` header comment, the per-project `for proj in ...` loop, and the `known` list in `check_project_drift`. The tracked set is the union of entries in `## Components` and `## Structure` whose name maps to a top-level directory. Sub-components (e.g. `notio-backend`, `docker/langfuse`) are skipped. Top-level directories present in the repo but absent from both tables are not silently added to or dropped from the loop — the agent surfaces them in the PR description as "candidates for Components or Structure registration" and leaves the call to the maintainer.
2. `docs/products.html` — product cards. The `## Components` table is authoritative for canonical card content: the `Name`, `Type`, and `Description` columns drive the card's name, type tag, and description. Per-project READMEs are read only for enrichment (e.g. a deployed URL where the README states one). Manual edits to `docs/products.html` card content are not preserved across runs by design — maintainers express card content by editing the Components row, not the HTML. Category-header placement (within the existing 8 headers) is derived from the `Type` column per a mapping pinned in the agent definition.
3. `docs/loc-dashboard.html` — the `data = [...]` array consumed by the chart. Refreshed mechanically from `scripts/loc-dashboard.sh` output.

## Surfaces explicitly out of scope

- `README.md` `## Components` table — owned by `doc-drift-agent`. When this agent registers a new project in surfaces (1)–(3), `doc-drift-agent`'s next scheduled run flags the missing Components row as README drift.
- `<project>/docs/log.md` and `docs/log.md` — log entries are human-authored; the agent does not seed or update logs.
- `release-units.config.toml` and per-project CI workflows — outside the dashboard-sync surface.
- README content, formatting, style — never touched by this agent on any surface.

## Triggers

- **Manual.** A maintainer issues a Telegram command to OpenClaw.
- **Scheduled.** Cron fires the agent at `30 1 * * *` UTC daily (01:30 UTC).

## Output

- **PR-only.** The agent never merges or approves a PR.
- **One PR per run when there is drift.** The agent reuses a stable branch so re-runs update an existing PR rather than piling up duplicates.
- **Per-surface short-circuit.** Each of the three surfaces is checked independently. If all three detect zero drift, no PR is opened. Otherwise the PR contains changes only for the surfaces that drifted.

## Hard constraints

- **Allowlist.** The agent writes only to `scripts/loc-dashboard.sh`, `docs/products.html`, `docs/loc-dashboard.html`, and to its own per-agent runtime state file under `~/.openclaw/agents/dashboard-sync-agent/` (mirroring `doc-drift-agent`'s state-file pattern). Any other write is a violation.
- **Never merge a PR. Never approve a PR.**
- **No formatting or restructure passes.** Discard candidate changes that reduce to formatting, word choice, or reorganization on any surface.
- **Minimum edit.** Each change is the smallest edit that resolves the drift on that surface.
