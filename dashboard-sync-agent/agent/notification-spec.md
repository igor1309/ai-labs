---
date: 2026-05-10
model: claude-opus-4-7
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

Single Telegram chat: `54589373` (maintainer DM with the agent's bot, the same chat allowlisted in `openclaw.json` `channels.telegram.accounts.dashboardsync.allowFrom`).

## Message formats

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
