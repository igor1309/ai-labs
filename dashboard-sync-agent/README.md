---
date: 2026-05-10
model: claude-opus-4-7
description: "dashboard-sync-agent project README — sibling OpenClaw agent that keeps scripts/loc-dashboard.sh, docs/products.html, and the docs/loc-dashboard.html data array in sync with repo state on a daily 6PM UTC cron"
---

# dashboard-sync-agent

Definition for a specialized OpenClaw agent that keeps three repo surfaces in sync with current `ai-labs` state and proposes the changes as PRs:

- `scripts/loc-dashboard.sh` (project list)
- `docs/products.html` (product cards, regenerated from READMEs)
- `docs/loc-dashboard.html` (the `data = [...]` array consumed by the chart)

Sibling to `doc-drift-agent`: same OpenClaw runtime pattern, distinct editable-file allowlist, distinct cron cadence. README drift remains owned by `doc-drift-agent`.

This directory owns the source of truth for what the agent inspects, how it synthesizes changes, and the shape of its sync PRs and notifications. The runtime — schedule, Telegram listener, GitHub credentials — will live in OpenClaw and is out of scope for the source tree.

## Status

**Definition authored.** Intent and ADR landed 2026-05-10 on branch `codex/dashboard-sync-agent`. Agent definition artifacts and CI sync workflow are present; VPS runtime deployment remains owned by OpenClaw.

## Source

- Intent: `dashboard-sync-agent/docs/intent.md`
- ADR: `dashboard-sync-agent/docs/adr-specialized-openclaw-agent-dashboard-sync-v0.0.1.md` (status: proposed)

## Layout

| Path | Purpose |
|------|---------|
| `docs/intent.md` | Source intent |
| `docs/adr-specialized-openclaw-agent-dashboard-sync-v0.0.1.md` | Source ADR |
| `docs/log.md` | Project log |

The `agent/` subtree has been added. A `runtime/` subtree (mirroring `doc-drift-agent/`) will be added if source-owned runtime artifacts are needed.

## Boundaries

- The agent's editable-file allowlist is exactly: `scripts/loc-dashboard.sh`, `docs/products.html`, `docs/loc-dashboard.html`, plus its own per-agent runtime state under `~/.openclaw/agents/dashboard-sync-agent/`.
- The agent never edits `README.md` (including the `## Components` table), per-project READMEs, log files, `release-units.config.toml`, or per-project CI workflows.
- The agent never merges or approves PRs.
- The `## Components` and `## Structure` tables in the root `README.md` are the authoritative registries: their union (filtered to top-level-directory entries) is the tracked set. The `## Components` table specifically drives `docs/products.html` card content (`Name`, `Type`, `Description`).
- Manual edits to `docs/products.html` are not preserved across runs.
- Top-level directories present in the repo but absent from both registries are surfaced in the PR description as "candidates for Components or Structure registration" rather than silently added or dropped.
- Sub-projects (below top-level) and Components sub-components (e.g. `notio-backend`, `docker/langfuse`) are out of scope.

## Description

Sibling OpenClaw agent that keeps *scripts/loc-dashboard.sh*, *docs/products.html*, and the *docs/loc-dashboard.html* data array in sync with repo state on a daily 18:00 UTC cron. The root README's Components and Structure tables are the authoritative project registries; manual edits to products.html are not preserved across runs. Auto-merge is never used.

## Stack

- OpenClaw
- Bash
- HTML
- GitHub PRs
- Telegram
