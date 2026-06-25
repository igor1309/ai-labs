---
name: add-openclaw-agent
author: Igor Malyarov
version: "0.1.0"
description: Use when adding a new specialized OpenClaw agent to a gateway deployment (a repo-reviewer, a notifier, or an on-demand assistant reachable via Telegram). Encodes the decision order, the directory + CI-sync layout, the one-bot/one-topic Telegram routing, and two non-obvious verified runtime constraints (forum-topic file delivery and web-search providers) so you don't re-derive them per agent. Triggers on "add an OpenClaw agent", "new OpenClaw bot", "create an agent that runs on the gateway".
---

# Add an OpenClaw Agent

A decision-ordered checklist for adding a specialized agent to an OpenClaw gateway.
It is a **process + pointers** guide, not a copy of the deployment's facts — the
concrete host, bot, supergroup, topic, and chat IDs live in the deployment's own
docs and are read fresh from there (see **Sources of truth** at the end). Do not
hardcode those values into an agent definition or into this skill.

## Mental model

A specialized agent is a **definition that lives in your repo** and a **runtime
owned by the gateway**:

- The definition is a directory (`agent/agent.md` + supporting `*.md`). CI rsyncs
  `agent/**` to the gateway's per-agent workspace, renaming `agent.md` → `AGENTS.md`
  (OpenClaw loads workspace `AGENTS.md` as the system prompt).
- The runtime — schedule, listener, credentials, checkout path — is the gateway's
  concern. The agent definition must not assume a runtime layout beyond what it is
  handed.

Keep the agent's *standard* (the rubric/prompt it applies) read fresh from its
source where practical, rather than vendoring a copy that will drift.

## Decide first (these change the shape)

1. **Trigger mode.**
   - **Inbound-only** — runs only when messaged in Telegram (`@`-mention in its
     topic). Simplest: no cron wrapper, no suppression gate, no heartbeat.
   - **Scheduled** — a `/etc/cron.d` wrapper invokes it on a cadence. Never use the
     gateway scheduler (`openclaw cron add`) for anything that must survive a restart
     — those jobs are wiped on every gateway restart. System `/etc/cron.d` only.
   - **Both** — inbound + scheduled (needs a suppression gate so a manual run
     doesn't collide with the next tick).
2. **Does it write to a repo?** A reviewer opens PRs (needs `gh` write scope, a
   branch convention, an auto-merge-forbidden rule). A self-contained assistant
   (e.g. research) writes nothing — its only output is the message/file it returns.
3. **Output channel + size.** A short status fits a normal text reply. A long
   artifact (a report) needs file delivery — see the **Forum-topic file delivery**
   constraint below before promising "I'll attach a file."

## Layout

```
agents/<agent-name>/
├── agent/
│   ├── agent.md              # system prompt → deployed as AGENTS.md
│   └── *.md                  # notification-spec / suppression-policy / etc. as needed
├── runtime/                  # ONLY if scheduled — cron wrapper + /etc/cron.d entry
│   └── cron/
├── docs/
│   └── log.md
├── README.md
└── TODO.md
```

## CI sync

Add `.github/workflows/<agent-name>-sync.yml` modeled on an existing
`*-agent-sync.yml`: on push to the default branch touching `agents/<agent-name>/agent/**`,
rsync `agent/**` to the gateway workspace and `mv agent.md AGENTS.md`. Reuse the
existing deploy SSH key secret.

> **`runtime/**` is NOT CI-synced.** Cron wrappers are hand-deployed (scp + `chmod 700`).
> A wrapper edit in the repo does not reach the host until someone re-deploys it.

## Telegram routing (shared-bot convention)

One bot, one forum-supergroup, **one topic per agent**:

- **Inbound** routes per topic via
  `channels.telegram.accounts.<acct>.groups.<chatId>.topics.<threadId>.agentId`,
  with `groupPolicy: "allowlist"` and `requireMention: true` (`@`-mention the bot
  in the topic to trigger that topic's agent).
- **Register** the agent in `openclaw.json` `agents.list` (`{id, workspace}`); add the
  inbound topic binding only if it answers inbound (a cron-only agent is registered
  without a binding).
- **Find a topic's `threadId`** by copying any message link in the topic:
  `t.me/c/<chat>/<threadId>/<msg>` — the middle segment is the `threadId`. With
  `requireMention: true`, OpenClaw does not log the threadId for skipped non-mention
  posts, so use this link trick, not the inbound logs.
- The bot must be **admin** in the supergroup (privacy mode otherwise hides
  non-mention posts). The **General topic (`threadId=1`)** must omit
  `message_thread_id` on sends — Telegram rejects `thread_id=1`.

## Two verified runtime constraints (don't re-derive)

### Forum-topic file delivery — the agent's message tool can't do it

In a Telegram **forum topic** (`is_forum: true`), OpenClaw **auto-disables the
agent's `message` tool** (`disableMessageTool=true`) — not overridable by
`channels.telegram.actions.sendMessage` or `tools.allow` (OpenClaw issue #31368,
closed *won't-fix*). And even outside topics the message tool only sends
image/audio/video/sticker via `mediaUrl` — **not generic documents**.

To deliver a document (a `.md`/`.pdf` report) into a topic, the agent must **shell
out**: write the file, then call the Telegram Bot API **`sendDocument`** itself via
its `exec` tool, passing `chat_id` + `message_thread_id` (documents up to 50 MB).
This is the same deterministic Bot API pattern scheduled wrappers use for
`sendMessage`. The `openclaw message send --channel telegram --thread-id <topic>
--media <file>` CLI is the documented workaround but is image/audio/video-oriented,
so prefer raw `sendDocument` for a true document. A short text summary can still ride
the normal reply channel; only the file needs the shell path.

### Web research — `web_fetch` is free, `web_search` needs a provider

- **`web_fetch`** — plain HTTP GET, HTML→markdown, **no key, on by default**. Good
  for reading a known URL (official site, docs, changelog). No JS execution.
- **`web_search`** — enabled by default but **needs a provider selected**.
  Key-required: Brave, Tavily, Exa, Firecrawl, Perplexity, Gemini, Grok, Kimi.
  **Key-free: DuckDuckGo, Codex Hosted Search, SearXNG, Parallel (free), Ollama.**
  On a **Codex-harness deployment** (`codex/*` model over OpenAI OAuth), prefer
  **Codex Hosted Search** — it rides existing auth, no new key. Confirm/set
  `tools.web.search.provider` on the live config.

## VPS wiring + the maintenance rule

Wiring the agent on the host (config edit, binding, cron, new topic) is an
approval-required, SSH-authorized step. **Any live change to gateway config
(`openclaw.json`, bindings, cron, sudoers, the unit, scripts) MUST be mirrored to
the deployment's external inventory docs (`migration.md` + dated `log.md`) in the
same change.** SSH to the live host requires explicit per-session authorization
naming the host.

## Checklist

- [ ] Trigger mode chosen (inbound / scheduled / both).
- [ ] Repo-writing vs. self-contained decided (PR scope + `gh` scope if writing).
- [ ] Output channel sized; if a file → the `sendDocument`-via-`exec` path is in the
      agent's `agent.md`.
- [ ] `agents/<name>/` laid out; `agent/agent.md` written; `runtime/` only if scheduled.
- [ ] `<name>-sync.yml` added; deploy key reused.
- [ ] Registered in `agents.list`; inbound topic binding added (if inbound); new topic
      created; `threadId` captured.
- [ ] Web provider confirmed (Codex Hosted Search or other) if the agent browses.
- [ ] Live change mirrored to inventory `migration.md` + `log.md`; agents register in
      the repo's agents `README.md`/dashboards.

## Sources of truth (read these for the concrete IDs — do not copy them here)

- The deployment's `agents/README.md`, `agents/runbook.md`, `agents/gotchas.md` —
  the shared-bot/supergroup/topic IDs, routing caveats, and per-agent registry.
- The inventory `vps/OpenClaw/README.md`, `CLAUDE.md`, `gotchas.md`,
  `agent-cron-jobs.md` — host/access, config layout, cron mechanism, live state.
- An existing agent of the closest shape (a reviewer, or an inbound-only assistant)
  as the structural template.
