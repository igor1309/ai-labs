---
date: 2026-07-01
model: claude-opus-4-8
description: "24-hour suppression rule for scheduled weekly-review runs of the hermes-memory-review-agent: timezone, comparison, and the run/skip decision. The hourly ping is not gated by this policy."
---

# Suppression Policy

A scheduled **weekly-review** run is suppressed (skipped, not invoked) if a
manual weekly-review completed less than 24 hours before the scheduled tick. This
document pins the comparison so the runtime, the maintainer, and any reviewer
compute the same skip/run decision from the same inputs.

The **hourly ping is not subject to this policy** — it is deterministic,
wrapper-owned, and idempotent via its cursor (`notification-spec.md`), so a
manual run cannot collide with it in a way suppression would fix.

## Decision rule

Let:

- `T_now` = the moment OpenClaw is about to invoke the agent for a scheduled
  weekly tick.
- `T_last_manual` = the wall-clock end of the most recent successful manual
  weekly-review, or `null` if none has ever completed.

Then:

- If `T_last_manual` is `null`, the scheduled tick **runs**.
- If `T_now − T_last_manual < 24 hours`, the tick **is suppressed**.
- If `T_now − T_last_manual ≥ 24 hours`, the tick **runs**.

The comparison is strict-less-than versus greater-than-or-equal. A tick exactly
24 hours after the last manual run is allowed to run.

## Timezone

All timestamps are recorded and compared in **UTC** — no local timezone, no DST.
The runtime stores `T_last_manual` as a UTC timestamp; the cron schedule is UTC;
the comparison subtracts UTC from UTC. This matches the repo-wide convention for
scheduled jobs and avoids the DST edges that would let one tick per spring/autumn
slip past or block the gate.

## "Successful manual run" — definition

`T_last_manual` is the timestamp at which a *successful* manual weekly-review
finished. A run is successful when:

1. The agent completed without a hard error.
2. The report was rendered and either committed or recorded as a `no-op`.

A manual run that failed before rendering the report does **not** update
`T_last_manual` — so an operator-side mishap does not silently block the next
scheduled weekly coverage.

## Where `T_last_manual` lives

`~/.openclaw/agents/hermes-memory-review-agent/state.json`, field
`last_manual_run_utc`. The **agent** writes it on manual-run completion (step 8
of `agent.md`, `write` tool); the **cron wrapper** reads it on every scheduled
weekly tick. The wrapper's own `last_ping` field in the same file is independent
and untouched by this gate.

## Worked examples

| `T_now` (UTC) | `T_last_manual` (UTC) | Diff | Decision |
|---------------|-----------------------|------|----------|
| 2026-07-05 06:00 | `null` | n/a | run |
| 2026-07-05 06:00 | 2026-07-04 06:01 | 23h 59m | suppress |
| 2026-07-05 06:00 | 2026-07-04 06:00 | 24h 00m | run |
| 2026-07-05 06:00 | 2026-07-04 20:15 | 9h 45m | suppress |
| 2026-07-05 06:00 | 2026-07-03 20:15 | 33h 45m | run |

## What the agent sees

The agent never reads or evaluates this gate. The runtime suppresses the
invocation entirely; from the agent's perspective every invocation is a real run,
and the only observable effect of suppression is a missing scheduled weekly run —
expected behavior, not a defect.

## Out of scope

- Manual-run debouncing (a manual run during another manual run) — the runtime's
  manual-trigger handler decides.
- Suppression of *manual* runs by prior scheduled runs — the gate is
  one-directional: scheduled weekly runs suppress, manual runs do not.
- The hourly ping — not gated here (see intro).
