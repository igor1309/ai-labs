---
date: 2026-06-01
model: claude-opus-4-8
description: "agents/ gotchas — OpenClaw Telegram topic-routing caveats for the shared-bot agents"
---

# agents/ — gotchas

- **Per-agent topic routing is supergroup-only.** OpenClaw routes different agents to different topics only via `groups.<chatId>.topics.<threadId>.agentId` in a forum **supergroup**. DM topics give isolated sessions but all reach one agent — they cannot route per-agent.
- **General topic (`threadId=1`)** must omit `message_thread_id` on sends — Telegram rejects `thread_id=1`.
- **Admin vs privacy mode.** With privacy mode on, a non-admin bot sees only mentions / commands / replies. Admin status is what lets it see plain topic posts. With `requireMention: true`, OpenClaw skips non-mention posts (logs `reason:no-mention`) *without* logging the threadId — so discover ids via the message-link trick (last bullet) rather than from inbound logs.
- **Hyphen in the account id.** `ai-labs` is valid (`normalizeAccountId` lowercases but preserves hyphens), but a hyphen needs jq bracket form in wrappers: `accounts["ai-labs"].botToken`, not `accounts.ai-labs.botToken`.
- **Finding a topic's threadId:** copy any message link in the topic — `t.me/c/<chat>/<threadId>/<msg>` — the middle segment is the threadId.
