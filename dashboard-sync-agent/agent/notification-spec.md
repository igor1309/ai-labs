---
date: 2026-06-01
model: claude-opus-4-8
description: "Telegram notification format for dashboard-sync-agent. The cron wrapper applies this spec; the agent itself does not send Telegram messages."
---

# Notification Spec

The agent's runtime (the cron wrapper at `/home/openclaw/.openclaw/scripts/dashboard-sync-cron.sh` for scheduled runs, or the OpenClaw Telegram listener for manual runs) decides what to post to Telegram based on the sync report's `Surfaces drifted` count and the run mode.

## Routing rules

| Run mode | Surfaces drifted | Action |
|----------|-------------------|--------|
| manual | 0 | Post short ack (see below). |
| manual | ≥ 1 | Post drift summary + PR link. |
| scheduled | 0 | **Silent.** No Telegram message. |
| scheduled | ≥ 1 | Post drift summary + PR link. |

A run with `Surfaces in error` ≥ 1 always posts (regardless of mode and drift count) so the maintainer is alerted.

## Channel

Shared bot `@igor1309_ai_labs_bot` (OpenClaw account `ai-labs`), posting into the forum supergroup `-1003954520541`, topic `#dashboard-sync` (`message_thread_id` 6). This replaces the retired per-agent `dashboardsync` bot and maintainer DM `54589373` (account and bot deleted; see `docs/log.md`, 2026-06-01). The live cron wrapper on the VPS is the source of truth for the token and thread id; these values are recorded here so the spec is not stale.

## Rendering

These rules are mandatory; a run that posts anything else to Telegram is a defect.

- **Never post the agent's raw run report.** The report (per `report-format.md`) is Markdown — `##` headers and a `| Surface | Status | … |` per-surface table — which Telegram does not render and which reads as noise. The runtime parses the report's fields and emits only the compact formats below. Forwarding the report verbatim (headers, tables, PR-body footer, tool-call traces) is the bug this section exists to prevent.
- **Send as plain text.** Post with no Telegram parse mode (no Markdown, no MarkdownV2, no HTML). The compact formats contain no markup, so literal `#`, `|`, `*`, or backticks must never appear in a posted message. Because no parse mode is set, message text needs no escaping.
- **One message per run.** A single message in the compact format, not a stream of lines or the multi-section report.

## Message formats

The `·` separators and leading `· ` bullets below are literal plain-text characters, not Markdown. Each block is the entire message body.

### Drift summary

Posted when at least one surface drifted, in any mode.

```
[dashboard-sync] <run mode> · <YYYY-MM-DD HH:MM UTC>

<drifted-count>/3 surfaces drifted, <error-count>/3 in error
Tracked: <N> projects · Candidates: <N> · Removed: <N>

PR: <URL or "(failed to open)">

· loc-dashboard.sh: <status>
· products.html: <status>
· loc-dashboard.html: <status>
```

`<status>` is one of `clean`, `drift (+<a> -<r>)`, `error: <reason>`. Surfaces in error are listed even when other surfaces drifted.

If the candidates list or removed-directory list is non-empty, two extra lines are appended:

```
Candidates: <comma-separated names, max 10, with "…" if truncated>
Removed: <comma-separated names, max 10, with "…" if truncated>
```

### Manual ack (no drift)

Posted on a manual run where all three surfaces are clean.

```
[dashboard-sync] manual · <YYYY-MM-DD HH:MM UTC>

All three surfaces clean. <N> projects tracked. No PR opened.
```

### Error-only

Posted when at least one surface is `error` but no surface drifted (a degenerate state — the agent could not evaluate one or more surfaces). In any mode.

```
[dashboard-sync] <run mode> · <YYYY-MM-DD HH:MM UTC>

<error-count>/3 surfaces in error. No drift detected on the rest.
No PR opened.

· <surface>: <reason>
· <surface>: <reason>
```

## Truncation rule

Telegram's per-message limit is 4096 characters. The wrapper truncates the message body to 4000 characters and appends `…(truncated; full report at /home/openclaw/.openclaw/logs/dashboard-sync-cron.log on VPS)` if the limit is exceeded. The candidates and removed lists are the most likely culprits and are truncated first.

## What the agent does not do

The agent itself does not call the Telegram API. It returns the sync report (per `report-format.md`) to the runtime; the runtime decides per this spec whether to post and what to post. This separation is intentional — the agent's correctness is verifiable by inspecting the report, independent of Telegram delivery.
