---
date: 2026-06-01
model: claude-opus-4-8
description: "agents/ — specialized OpenClaw agents defined in ai-labs and run on the OpenClaw VPS; cross-cutting conventions for notifications, runtime deployment, and per-agent layout"
---

# agents/

Specialized OpenClaw agents whose definitions live in `ai-labs` and whose runtime is the OpenClaw VPS. Each agent owns a subdirectory: `agent/` (system prompt + specs, synced to the VPS workspace), `runtime/` (cron wrapper + entry), `docs/`, and a `README.md`.

`doc-drift-agent` and `dashboard-sync-agent` predate this directory and still live at the repo top level; consolidating them under `agents/` is tracked in issue #434.

## Conventions

### Telegram routing — one bot, one topic per agent

**Live (2026-06-01).** All `igor1309/ai-labs`-defined OpenClaw agents share the single bot **`@igor1309_ai_labs_bot`** (account `docdrift`) inside one Telegram **forum supergroup**, chatId **`-1003954520541`**, one topic per agent:

| Topic | threadId | Agent |
|-------|----------|-------|
| `#maestro-review` | `2` | `maestro-flow-review-agent` |
| `#doc-drift` | `4` | `doc-drift-agent` |
| `#dashboard-sync` | `6` | `dashboard-sync-agent` |
| `#health` | `8` | — (dead-man's-switch, item #1) |

Per-topic routing is native in OpenClaw: **inbound** via `channels.telegram.accounts.docdrift.groups."-1003954520541".topics.<threadId>.agentId` (`groupPolicy: allowlist`, `requireMention: true` — `@`-mention the bot in a topic to trigger its agent); each topic has an isolated session. **Outbound** notifications: each cron wrapper posts `chat_id=-1003954520541` + `message_thread_id=<2|4|6>`. **No per-agent accounts or bots** — this supersedes the per-agent-account pattern and makes the cron-only `maestro-flow-review-agent` shape the norm. The bot must stay **admin** in the supergroup (admins receive all posts; privacy mode otherwise blocks non-mention messages).

The old `@dashboard_sync_agent_bot` / `dashboardsync` account is now unused — teardown tracked in `TODO.md` #3.

### Runtime deployment

The per-agent CI sync workflow (`.github/workflows/<agent>-sync.yml`) ships only `agent/**` to the VPS workspace. The `runtime/` cron wrapper is **deployed manually** (scp + `chmod 700`), so editing a wrapper requires a manual re-deploy — it is not picked up by the sync workflow. See `TODO.md`.

Any live VPS change must be reflected in the `inventory` repo (`vps/OpenClaw/{README,migration,log}.md`) in the same change.

## Agents here

| Agent | Reviews | Status |
|-------|---------|--------|
| `maestro-flow-review-agent` | `igor1309/ios.config` Maestro flow YAML (opens fix PRs) | Live — daily 03:00 UTC |

Cross-cutting work spanning more than one agent lives in `TODO.md`.
