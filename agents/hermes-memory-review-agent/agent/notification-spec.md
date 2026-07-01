---
date: 2026-07-01
model: claude-opus-4-8
description: "Telegram notification format for the hermes-memory-review-agent: the weekly report delivery + compact summary in the review topic, the hourly memory-ping in the ping topic, and the fail-closed run-failed alert. Two topics, one shared bot."
---

# Notification Spec

The cron wrapper (`runtime/cron/hermes-memory-review-cron.sh`) posts every
Telegram message for this agent. There are **two topics** on the shared ai-labs
agents bot: a **review** topic (weekly report) and a **memory-ping** topic
(hourly ping). The wrapper builds each message deterministically; it never
forwards the agent's raw stdout.

## When each message is posted

| Path | Condition | Topic | Message |
|------|-----------|-------|---------|
| weekly-review | `Status: ok`, `Findings ≥ 0` | review | report file (`sendDocument`) + compact summary |
| weekly-review | `Status: no-op` | review | compact "no change" summary (no file re-sent) |
| weekly-review | `Status: failed` | review | fail-closed "run FAILED" alert |
| hourly-ping | new staged items | memory-ping | "memory updates staged" count |
| hourly-ping | nothing new | memory-ping | **silent** — no message |
| hourly-ping | wrapper error | memory-ping | fail-closed "ping FAILED" alert |

Rationale: a scheduled hourly ping with nothing new is noise, so it is silent; a
failed run (weekly or ping) is never silent — a failure the maintainer cannot see
is worse than noise.

## Rendering (mandatory)

- **Never post the agent's raw run output.** The `openclaw agent` invocation
  emits plugin warnings and tool-call traces alongside the run-result. The
  wrapper parses only the run-result fields (`report-format` "run-result") and
  builds the compact text below. Forwarding captured output verbatim is a defect.
- **Send as plain text.** No parse mode (no Markdown/MarkdownV2/HTML). The
  compact format carries no markup, so no `#`, `|`, `*`, or backticks appear and
  no escaping is needed.
- **The report file rides `sendDocument`, not the message.** In a forum topic the
  agent `message` tool is auto-disabled and cannot attach a document, so the
  wrapper calls the Telegram Bot API `sendDocument` with `chat_id` +
  `message_thread_id` for the review topic. Delivery success = HTTP 200 with
  `ok:true`; on failure the wrapper retries once, then notes a failed delivery
  (the commit still stands).

## Weekly review — report delivery + summary (review topic)

The wrapper first `sendDocument`s `reviews/memory-review/<date>.md`, then posts:

```
[hermes-review] Weekly review — <snapshot-date>

Findings: <count>
Sessions reviewed: <count> · staged skills: <count> · staged memory: <count>
Commit: <short SHA> on <branch>

Report attached above. Proposes only — review and promote by hand.
```

- `[hermes-review]` prefix is literal and byte-identical across all messages.
- Every value is parsed from the agent run-result / report header; the wrapper
  does not recompute them.
- The closing "Proposes only" line is mandatory — it mirrors the never-merge rule.

For a `no-op` run (report byte-identical to what is already committed), the
wrapper skips `sendDocument` and posts the same block with
`Commit: none (no change)` and a first line `Weekly review — <date> (no change)`.

## Hourly ping (memory-ping topic)

Posted only when the wrapper finds `pending/memory/` ids not in the durable
cursor (`state.json last_ping.ids`):

```
[hermes-review] <N> memory update(s) staged

Since the last ping. Review/apply before they age into the weekly cycle.
```

- `<N>` is the count of new ids this run. No memory content is included — the
  ping carries a number only.
- After the message is delivered successfully, the wrapper advances the cursor to
  the current id set. A failed delivery leaves the cursor unchanged so the next
  run retries.

## Run-failed alert (fail-closed)

Posted to the relevant topic when the weekly agent run exits non-zero or emits no
parseable run-result, or when the hourly wrapper path errors.

```
[hermes-review] ⚠ <weekly | ping> run FAILED

When: <YYYY-MM-DD HH:MM UTC>
Exit: <rc> · <one-line reason>
Check the gateway and <log path> on VPS.

<bounded tail of the captured output>
```

- Only a **bounded tail** of captured output is included (never the whole file),
  so a flood of plugin warnings cannot reconstruct a raw dump.
- The alert is posted regardless of trigger — a failure must be visible.

## Telegram channel

The shared ai-labs agents bot posts into two forum topics of the ai-labs agents
supergroup: the **review** topic and the **memory-ping** topic. The concrete
`chat_id` and both `message_thread_id`s are **inventory-owned** (allocated during
wiring) and live in the cron wrapper on the VPS, which is the source of truth for
them and for the bot token (read from `~/.openclaw/openclaw.json`, mode 600, at
runtime — never inlined). This spec is topic-count and format authoritative; the
IDs are recorded on the VPS so this doc does not go stale.

## Failure modes

If the wrapper cannot post a message (network, rate limit, invalid token), the
`curl` call fails and is swallowed (`|| true`) so a delivery failure never aborts
the run. The full agent output for the run is in the cron log on the VPS, so the
message can be reconstructed by hand. The committed report is unaffected by
Telegram failures — it remains a valid artifact in the canonical repo.
