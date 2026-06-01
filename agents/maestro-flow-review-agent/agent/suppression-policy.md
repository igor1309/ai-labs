---
date: 2026-06-01
model: claude-opus-4-8
description: "12-hour suppression rule for scheduled runs of the maestro-flow-review-agent: timezone, comparison, and the run/skip decision — with a suppressed-tick heartbeat so absence still means failure"
---

# Suppression Policy

A scheduled run of the maestro-flow-review-agent is suppressed (skipped, not invoked) if a successful **manual** run completed less than **12 hours** before the scheduled tick. This avoids a scheduled re-review stepping on a fresh manual one; PR idempotence (`agent.md` step 8) already prevents duplicate PRs, so the gate is a courtesy, not a correctness requirement.

A suppressed tick is **not silent**: the cron wrapper posts the suppressed-tick message from `notification-spec.md`, so the heartbeat guarantee ("one message per tick, absence = failure") still holds.

## Decision rule

Let:

- `T_now` = the moment the runtime is about to invoke the agent for a scheduled tick.
- `T_last_manual` = the wall-clock end of the most recent successful manual run, or `null` if none has ever completed.

Then:

- If `T_last_manual` is `null`, the scheduled tick **runs**.
- If `T_now − T_last_manual < 12 hours`, the scheduled tick **is suppressed** (wrapper posts the suppressed message).
- If `T_now − T_last_manual ≥ 12 hours`, the scheduled tick **runs**.

Strict-less-than versus greater-than-or-equal: a tick exactly 12 hours after the last manual run runs.

## Timezone

All timestamps are recorded and compared in **UTC** — no local timezone, no DST. The cron schedule is UTC (`openclaw-maestro-review.cron`), `T_last_manual` is stored UTC, and the comparison subtracts UTC from UTC. This matches the repo-wide cron rule in `CLAUDE.md`.

## "Successful manual run" — definition

`T_last_manual` is the timestamp at which a *successful* manual run finished. A run is successful when:

1. The agent completed without a hard error.
2. The `review.md`-format review and the parseable run summary (`notification-spec.md`) were rendered.
3. Any PR the agent intended to open was either opened/updated or recorded as `PR: none` with a reason.

A manual run that crashed before rendering its summary does **not** update `T_last_manual`, so it cannot silently block the next scheduled tick.

## Where `T_last_manual` lives

`~/.openclaw/agents/maestro-flow-review-agent/state.json`, `{ "last_manual_run_utc": "<ISO 8601 UTC>" }`. The agent writes it on successful manual runs only (`agent.md` step 10); the cron wrapper reads it on every scheduled tick. The store needs only: write on successful manual completion, read on each scheduled tick, and enough atomicity that a write cannot be partially observed by a concurrent read.

## What the agent sees

The agent never evaluates this gate. The runtime suppresses the invocation entirely; the agent has no record of suppressed ticks. From the agent's view every invocation is a real run.

## Worked examples

| `T_now` (UTC) | `T_last_manual` (UTC) | Diff | Decision |
|---------------|-----------------------|------|----------|
| 2026-06-01 03:00 | `null` | n/a | run |
| 2026-06-01 03:00 | 2026-05-31 15:01 | 11h 59m | suppress |
| 2026-06-01 03:00 | 2026-05-31 15:00 | 12h 00m | run |
| 2026-06-01 03:00 | 2026-06-01 00:15 | 2h 45m | suppress |
| 2026-06-02 03:00 | 2026-06-01 00:15 | 26h 45m | run |

## Out of scope

- Manual-run debouncing (a manual run during another manual run) — the runtime's trigger handler decides.
- Suppression of *manual* runs by prior scheduled runs. The gate is one-directional.
- Quiet-hours scheduling. The cadence is set in `openclaw-maestro-review.cron`.
