---
date: 2026-05-10
model: claude-opus-4-7
description: "Intent for dashboard-sync-agent: a sibling OpenClaw agent that keeps scripts/loc-dashboard.sh, docs/products.html, and the docs/loc-dashboard.html data array in sync with repo state on a daily 6PM UTC cron"
---

# dashboard-sync-agent — Intent

A specialized OpenClaw agent that runs daily at 18:00 UTC and keeps three repo surfaces in sync with current repo state. Sibling to `doc-drift-agent`: same runtime pattern (workspace sync, `AGENTS.md` system prompt, cron wrapper, Telegram notifier, PR-only output), distinct scope and editable-file allowlist.

## Surfaces in scope

The agent edits exactly three files:

1. `scripts/loc-dashboard.sh` — the `ROW PROJECTS` header comment, the per-project `for proj in ...` loop, and the `known` list in `check_project_drift`. The set of top-level directories that count as "projects" is determined by a project-detection methodology authored alongside the agent definition (see Methodology below). Sub-projects are out of scope.
2. `docs/products.html` — product cards. **READMEs are the authoritative source of truth for card content**; the agent regenerates each card on every run from the project's READMEs (root `README.md` Components row + per-project READMEs where present). Manual edits to `docs/products.html` are not preserved across runs by design — maintainers express card content by editing READMEs, not the HTML. The synthesis rules (which README content produces which card fields, how categories are assigned) are defined in the methodology artifact.
3. `docs/loc-dashboard.html` — the `data = [...]` array consumed by the chart. Refreshed mechanically from `scripts/loc-dashboard.sh` output.

## Methodology

Two judgments are not pinned in this Intent and live in a sibling artifact authored alongside the agent definition (mirroring `doc-drift-agent/agent/drift-methodology.md`):

- **Project detection.** The rule for deciding whether a top-level directory counts as a project for surfaces (1) and (2). A simple "has a root `README.md`" rule is insufficient — many current projects do not. The rule is authored once the agent.md is staged, with the current `scripts/loc-dashboard.sh` loop list as the empirical baseline.
- **Card synthesis.** Which README sections produce which `docs/products.html` card fields (name, type tag, description, deployed URL), and how each project is assigned to one of the existing category headers.

## Surfaces explicitly out of scope

- `README.md` `## Components` table — owned by `doc-drift-agent`. When this agent registers a new project in surfaces (1)–(3), `doc-drift-agent`'s next scheduled run flags the missing Components row as README drift.
- `<project>/docs/log.md` and `docs/log.md` — log entries are human-authored; the agent does not seed or update logs.
- `release-units.config.toml` and per-project CI workflows — outside the dashboard-sync surface.
- README content, formatting, style — never touched by this agent on any surface.

## Triggers

- **Manual.** A maintainer issues a Telegram command to OpenClaw.
- **Scheduled.** Cron fires the agent at `0 18 * * *` UTC daily.

## Output

- **PR-only.** The agent never merges or approves a PR.
- **One PR per run when there is drift.** The agent reuses a stable branch so re-runs update an existing PR rather than piling up duplicates.
- **Per-surface short-circuit.** Each of the three surfaces is checked independently. If all three detect zero drift, no PR is opened. Otherwise the PR contains changes only for the surfaces that drifted.

## Hard constraints

- **Allowlist.** The agent writes only to `scripts/loc-dashboard.sh`, `docs/products.html`, `docs/loc-dashboard.html`, and to its own per-agent runtime state file under `~/.openclaw/agents/dashboard-sync-agent/` (mirroring `doc-drift-agent`'s state-file pattern). Any other write is a violation.
- **Never merge a PR. Never approve a PR.**
- **No formatting or restructure passes.** Discard candidate changes that reduce to formatting, word choice, or reorganization on any surface.
- **Minimum edit.** Each change is the smallest edit that resolves the drift on that surface.
