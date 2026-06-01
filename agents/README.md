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

**Adopted architecture (rollout tracked in `TODO.md` #4).** All `igor1309/ai-labs`-defined OpenClaw agents — `maestro-flow-review-agent`, `doc-drift-agent`, `dashboard-sync-agent` — share the single bot **`@igor1309_ai_labs_bot`** inside one Telegram **supergroup with Topics enabled**, with **one forum topic per agent** (`#maestro-review`, `#doc-drift`, `#dashboard-sync`, plus a `#health` topic for the dead-man's-switch, item #1).

Per-topic routing is native in OpenClaw: a topic-only `channels.telegram.groups.<chatId>.topics.<threadId>.agentId` (or a `bindings[]` peer entry `{kind:"group", id:"<chatId>:topic:<threadId>"}`) assigns each topic to its agent; each topic gets an isolated session; wrappers post notifications to their topic via `messageThreadId`. **No per-agent accounts or bots** — this supersedes the old per-agent-account pattern (`docdrift`, `dashboardsync`) and makes the cron-only `maestro-flow-review-agent` shape the norm.

Interim state until the supergroup is live: wrappers post via the `docdrift` bot token (`@igor1309_ai_labs_bot`) to the flat chat `54589373`. The dedicated `@dashboard_sync_agent_bot` / `dashboardsync` account is retired as part of the topics cutover (`TODO.md` #3/#4).

### Runtime deployment

The per-agent CI sync workflow (`.github/workflows/<agent>-sync.yml`) ships only `agent/**` to the VPS workspace. The `runtime/` cron wrapper is **deployed manually** (scp + `chmod 700`), so editing a wrapper requires a manual re-deploy — it is not picked up by the sync workflow. See `TODO.md`.

Any live VPS change must be reflected in the `inventory` repo (`vps/OpenClaw/{README,migration,log}.md`) in the same change.

## Agents here

| Agent | Reviews | Status |
|-------|---------|--------|
| `maestro-flow-review-agent` | `igor1309/ios.config` Maestro flow YAML (opens fix PRs) | Live — daily 03:00 UTC |

Cross-cutting work spanning more than one agent lives in `TODO.md`.
