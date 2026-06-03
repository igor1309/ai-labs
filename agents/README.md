---
date: 2026-06-01
model: claude-opus-4-8
description: "agents/ — specialized OpenClaw agents whose definitions live here and run on the OpenClaw VPS; layout, conventions, and pointers to the runbook and gotchas"
---

# agents/

Specialized OpenClaw agents whose definitions live here and whose runtime is the OpenClaw VPS. Each agent owns a subdirectory: `agent/` (system prompt + specs, synced to the VPS workspace), `runtime/` (cron wrapper + entry), `docs/`, and a `README.md`.

`dashboard-sync-agent` predates this directory and still lives at the repo top level; consolidating it under `agents/` is tracked in issue #434.

## Agents

| Agent | Reviews |
|-------|---------|
| `doc-drift-agent` | `igor1309/ai-labs` documentation scopes (opens fix PRs) |
| `maestro-flow-review-agent` | `igor1309/ios.config` Maestro flow YAML (opens fix PRs) |

## Conventions

- **One shared bot, one topic per agent.** All agents notify and are triggered through a single Telegram bot, one forum-supergroup topic per agent — no per-agent bots/accounts. Concrete ids and config are in [`runbook.md`](runbook.md); OpenClaw routing caveats in [`gotchas.md`](gotchas.md).
- **Runtime is deployed by hand.** The per-agent CI sync workflow (`.github/workflows/<agent>-sync.yml`) ships only `agent/**` to the VPS workspace; the `runtime/` cron wrapper is copied manually, so a wrapper edit needs a manual re-deploy. See [`TODO.md`](TODO.md).
- **Reflect live VPS changes in inventory** in the same change.

Cross-cutting work spanning more than one agent lives in [`TODO.md`](TODO.md).
