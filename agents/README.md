---
date: 2026-06-01
model: claude-opus-4-8
description: "agents/ — specialized OpenClaw agents defined in ai-labs and run on the OpenClaw VPS; cross-cutting conventions for notifications, runtime deployment, and per-agent layout"
---

# agents/

Specialized OpenClaw agents whose definitions live in `ai-labs` and whose runtime is the OpenClaw VPS. Each agent owns a subdirectory: `agent/` (system prompt + specs, synced to the VPS workspace), `runtime/` (cron wrapper + entry), `docs/`, and a `README.md`.

`doc-drift-agent` and `dashboard-sync-agent` predate this directory and still live at the repo top level; consolidating them under `agents/` is tracked in issue #434.

## Conventions

### Notification bot

All `igor1309/ai-labs`-defined OpenClaw agents reuse the **`@igor1309_ai_labs_bot`** Telegram bot (OpenClaw account `docdrift`) for notifications to chat `54589373`. A new agent's cron wrapper reads `channels.telegram.accounts.docdrift.botToken`; it does **not** provision its own bot/account. A cron-invoked agent (invoked by id, e.g. `maestro-flow-review-agent`) needs no inbound `bindings` entry at all.

`dashboard-sync-agent` was migrated to the shared bot on 2026-06-01 (its wrapper now reads `accounts.docdrift.botToken`). Its old `@dashboard_sync_agent_bot` / `dashboardsync` account survives only for inbound DM triggering and is slated for teardown — see `TODO.md`.

### Runtime deployment

The per-agent CI sync workflow (`.github/workflows/<agent>-sync.yml`) ships only `agent/**` to the VPS workspace. The `runtime/` cron wrapper is **deployed manually** (scp + `chmod 700`), so editing a wrapper requires a manual re-deploy — it is not picked up by the sync workflow. See `TODO.md`.

Any live VPS change must be reflected in the `inventory` repo (`vps/OpenClaw/{README,migration,log}.md`) in the same change.

## Agents here

| Agent | Reviews | Status |
|-------|---------|--------|
| `maestro-flow-review-agent` | `igor1309/ios.config` Maestro flow YAML (opens fix PRs) | Live — daily 03:00 UTC |

Cross-cutting work spanning more than one agent lives in `TODO.md`.
