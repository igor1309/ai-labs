---
date: 2026-06-01
model: claude-opus-4-8
description: "Scheduled-run suppression policy for dashboard-sync-agent. The cron wrapper enforces this gate before invoking the agent."
---

# Suppression Policy

A scheduled run is **skipped** if a manual run completed within the suppression window. This prevents redundant churn when a maintainer has just triggered a manual sync and the daily cron fires hours later against the same repo state.

## Window

**6 hours.** The agent's output is mechanical regen from registries and a script's tabular output; the half-life of meaningful new drift is shorter than for `doc-drift-agent`'s judgment-heavy review. A 6-hour window means a manual run after 19:30 UTC (the previous evening) suppresses the next 01:30 UTC scheduled tick; an earlier manual run does not.

This is half of `doc-drift-agent`'s 12-hour window and is intentional.

## State

The suppression gate reads `/home/openclaw/.openclaw/agents/dashboard-sync-agent/state.json`. Required shape:

```json
{"last_manual_run_utc": "<ISO 8601 UTC timestamp>"}
```

The value is `null` when no manual run has ever completed. Any other value is a UTC ISO 8601 timestamp recording the most recent manual run's completion time. The agent itself writes this file on manual runs (per `agent.md` step 9). The cron wrapper reads but does not write it.

## Decision rule

The cron wrapper computes:

```
now_epoch        = current Unix timestamp (UTC)
last_epoch       = epoch of state.json's last_manual_run_utc, or 0 if null
window_seconds   = 6 * 3600 = 21600
diff             = now_epoch - last_epoch

skip = diff < window_seconds
```

If `skip` is true, the wrapper exits silently without invoking the agent. If `skip` is false, the wrapper proceeds to refresh the source tree and invoke the agent with `--scheduled`.

## Worked examples

All times UTC.

| `last_manual_run_utc` | Scheduled tick at | `diff` | Decision |
|----------------------|-------------------|--------|----------|
| `null` | 2026-05-10 01:30 | n/a (last_epoch = 0) | run |
| 2026-05-09 19:00 | 2026-05-10 01:30 | 6h 30m | run |
| 2026-05-09 20:00 | 2026-05-10 01:30 | 5h 30m | skip |
| 2026-05-10 01:29 | 2026-05-10 01:30 | 1m | skip |
| 2026-05-10 01:30 | 2026-05-11 01:30 | 24h | run |

## Time zones

All comparisons use UTC. The state file stores UTC, the cron entry runs at UTC (`/etc/cron.d/openclaw-dashboard-sync`). The wrapper does not consult `$TZ`. Daylight-saving time in any local time zone has no effect.

## What this policy does not do

- It does not suppress **manual** runs. A maintainer can trigger `/dashboard-sync` repeatedly; the agent runs every time. The suppression gate applies only to scheduled triggers.
- It does not suppress based on the sync report's content (e.g. "no drift last time, suppress today"). Suppression is purely time-based off the last manual run.
- It does not back off on errors. A failing scheduled run does not extend or shorten the window; the next tick uses the same rule.

## Why this lives here, not in the agent

The agent assumes it is authorized to run when invoked. The runtime decides whether to invoke. Keeping the gate in the cron wrapper means the agent's behavior is identical between scheduled and manual runs (modulo the timestamp-write step), which simplifies testing and reasoning about correctness.
