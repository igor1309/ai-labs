---
date: 2026-09-05
model: gpt-6-astra
description: "dashboard-sync-agent project README — sibling OpenClaw agent that keeps scripts/loc-dashboard.sh, docs/products.html, and the docs/loc-dashboard.html data array in sync with repo state on a daily 01:30 UTC cron"
---

# dashboard-sync-agent

Definition for a specialized OpenClaw agent that keeps three repo surfaces in sync with current `ai-labs` state and proposes the changes as PRs:

- `scripts/loc-dashboard.sh` (project list)
- `docs/products.html` (product cards, regenerated from READMEs)
- `docs/loc-dashboard.html` (the `data = [...]` array consumed by the chart)

Sibling to `doc-drift-agent`: same OpenClaw runtime pattern, distinct editable-file allowlist, distinct cron cadence. README drift remains owned by `doc-drift-agent`.

This directory owns the source of truth for what the agent inspects, how it synthesizes changes, and the shape of its sync PRs and notifications. The runtime — schedule, Telegram listener, GitHub credentials — lives in OpenClaw and is out of scope for the source tree.

## Status

**Scheduled sync is a script.** `sync.js` renders the three surfaces from the registry and per-project READMEs exactly as `agent/synthesis-spec.md` and `agent/project-registry.md` define them, and reports each as clean, drift or error. `run.sh` runs it daily from a bb script automation: it checks out `origin/trunk` into a throwaway worktree, and on drift force-updates `dashboard-sync/daily` and opens or updates its PR. It never merges, and prints a summary only on drift or error.

- Dry run: `node dashboard-sync-agent/sync.js` (JSON report; `--write` applies, `--loc-threshold=<N>` overrides 300).
- Tests: `node --test scripts/tests/dashboard-sync.test.js`, including a check that trunk's script and products page render without drift.

The OpenClaw agent definition in `agent/` still serves the manual `/dashboard-sync` command on the VPS until that host's job is retired.

## Source

- Intent: `dashboard-sync-agent/docs/intent.md`
- ADR: `dashboard-sync-agent/docs/adr-specialized-openclaw-agent-dashboard-sync-v0.0.1.md` (status: proposed)

## Layout

| Path | Purpose |
|------|---------|
| `docs/intent.md` | Source intent |
| `docs/adr-specialized-openclaw-agent-dashboard-sync-v0.0.1.md` | Source ADR |
| `docs/log.md` | Project log |
| `sync.js` | Deterministic renderer and drift report |
| `run.sh` | Daily runner: worktree, stable branch, PR |

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

Sibling OpenClaw agent that keeps *scripts/loc-dashboard.sh*, *docs/products.html*, and the *docs/loc-dashboard.html* data array in sync with repo state on a daily 01:30 UTC cron. The root README's Components and Structure tables are the authoritative project registries; manual edits to products.html are not preserved across runs. Auto-merge is never used.

## Stack

- OpenClaw
- Bash
- HTML
- GitHub PRs
- Telegram
