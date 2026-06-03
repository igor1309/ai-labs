---
date: 2026-06-01
model: claude-opus-4-8
description: "agents/ runbook — Telegram supergroup/topic ids, the shared OpenClaw account, openclaw.json config paths, triggering, and bot requirements"
---

# agents/ — runbook

Operational details for the shared Telegram surface. Conceptual model: [`README.md`](README.md). Routing caveats: [`gotchas.md`](gotchas.md).

## Telegram surface

- **Bot:** `@igor1309_ai_labs_bot` — OpenClaw account `ai-labs`.
- **Supergroup chatId:** `-1003954520541` (forum; Topics enabled; the bot is an admin).

| Topic | threadId | Agent |
|-------|----------|-------|
| `#maestro-review` | 2 | `maestro-flow-review-agent` |
| `#doc-drift` | 4 | `doc-drift-agent` |
| `#dashboard-sync` | 6 | `dashboard-sync-agent` |
| `#health` | 8 | — (dead-man's-switch, [`TODO.md`](TODO.md) #1) |

## openclaw.json

- **Inbound:** `channels.telegram.accounts["ai-labs"].groups."-1003954520541".topics.<threadId>.agentId` (`groupPolicy: allowlist`, `requireMention: true`).
- **Outbound:** each cron wrapper reads `accounts["ai-labs"].botToken` and posts `chat_id=-1003954520541` + `message_thread_id=<2|4|6>`.

## Triggering an agent

`@`-mention the bot in its topic with an instruction — e.g. in `#doc-drift`: `@igor1309_ai_labs_bot run a drift review`. (A `/run`-style trigger is [`TODO.md`](TODO.md) #3.)

## Bot requirements

The bot must remain an **admin** in the supergroup: admins receive all messages, otherwise privacy mode blocks non-mention posts.
