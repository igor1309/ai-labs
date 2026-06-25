---
date: 2026-06-25
model: claude-opus-4-8
description: "Forward tasks for product-research-agent — post-deploy watches and follow-ups"
---

# product-research-agent — TODO

Forward tasks only. Completed work drops out; its record lives in git history,
`docs/log.md`, and `inventory/vps/OpenClaw/log.md`.

**Deployed live 2026-06-25** (see `docs/log.md`). Remaining:

## Watches / follow-ups

- [ ] **Long-turn Codex drop.** A research turn runs ~4 min; the Codex app-server connection occasionally drops at the **tail** (after the file is already sent) → a benign ⚠️ + OpenClaw retry. Escalate only if a request returns the ⚠️ with **no** file — then tune the Codex app-server turn/idle timeout. (`inventory/vps/OpenClaw/log.md` 2026-06-25.)
- [ ] Confirm the `agents` LOC row in `docs/loc-dashboard.html` picks up the new files (dashboard-sync-agent normally owns this).
- [ ] (Optional) Document the working `sendDocument` recipe — how the agent obtains the bot token + originating `chat_id`/`message_thread_id` at `exec` time — in `agent/agent.md`, now that it's verified live.

## Cross-refs

- Hardening the reusable `add-openclaw-agent` skill against this real build is tracked in `agents/TODO.md` §5. This deploy surfaced new items for it: the **rich-message/version gotcha** (forum-topic agent replies need OpenClaw ≥ 2026.6.9 so `richMessages` defaults off), **`createForumTopic` needs the bot to hold Manage-Topics** (else create the topic in-app and read the `threadId` from a message link), and the **per-topic `requireMention: false` override**.
