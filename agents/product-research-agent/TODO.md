---
date: 2026-06-25
model: claude-opus-4-8
description: "Forward tasks for product-research-agent — VPS wiring, delivery plumbing, and first-run validation before it goes live"
---

# product-research-agent — TODO

Forward tasks only. Completed work drops out; its record lives in git history and
`docs/log.md`.

## Deploy on the OpenClaw VPS (requires SSH authorization; mirror to `inventory`)

- [ ] Register the agent in `openclaw.json` `agents.list` as `{id: product-research-agent, workspace: ~/.openclaw/workspace-product-research}` (model inherited from `defaults`).
- [ ] Create a new **`#product-research` topic** in the ai-labs supergroup (`-1003954520541`) on `@igor1309_ai_labs_bot`; capture its `threadId`.
- [ ] Add the inbound binding: `channels.telegram.accounts["ai-labs"].groups."-1003954520541".topics.<threadId>.agentId = product-research-agent` (`requireMention: true`, allowlisted to chat `54589373`).
- [ ] Confirm/set the `web_search` provider to **Codex Hosted Search** on the live `openclaw.json` (`tools.web.search.provider`); `web_fetch` needs nothing.
- [ ] Restart the gateway; smoke-test (`openclaw agent --agent product-research-agent -m "reply with exactly: READY"`).
- [ ] Reflect every live change in `inventory/vps/OpenClaw/migration.md` + dated `log.md`, and add the agent to the README Agents + Telegram routing tables (same change).

## Finalize delivery plumbing

- [ ] Pin how the agent obtains, at `exec` time, the **bot token** and the **originating `chat_id` / `message_thread_id`** for the `sendDocument` call (the message tool is disabled in forum topics — issue #31368). Document the exact recipe in `agent/agent.md` once verified on the host.
- [ ] First live run: confirm a real report is written to a file and arrives as a topic attachment, with the one-line text summary beside it.

## Repo registration

- [ ] Add a row to `agents/README.md`'s Agents table (done in the landing change; re-check after merge).
- [ ] Confirm the `agents` LOC row in `docs/loc-dashboard.html` is refreshed (dashboard-sync-agent normally owns this; verify it picks up the new files).

## Cross-refs

- Hardening the reusable `add-openclaw-agent` skill against this first real build is tracked in `agents/TODO.md` §5.
