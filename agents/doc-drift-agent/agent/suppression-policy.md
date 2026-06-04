---
date: 2026-05-09
model: claude-opus-4-7
description: "12-hour suppression rule for scheduled runs of the doc-drift-agent: timezone, comparison, and the run/skip decision"
---

# Suppression Policy

A scheduled run of the doc-drift-agent is suppressed (skipped, not invoked) if a manual run completed less than 12 hours before the scheduled tick. The ADR mandates this gate; this document pins the comparison rule unambiguously so the runtime, the maintainer, and any reviewer compute the same skip/run decision from the same inputs.

## Decision rule

Let:

- `T_now` = the moment OpenClaw is about to invoke the agent for a scheduled tick.
- `T_last_manual` = the wall-clock end of the most recent successful manual run, or `null` if no manual run has ever completed.

Then:

- If `T_last_manual` is `null`, the scheduled tick **runs**.
- If `T_now − T_last_manual < 12 hours`, the scheduled tick **is suppressed**.
- If `T_now − T_last_manual ≥ 12 hours`, the scheduled tick **runs**.

The comparison is strict-less-than versus greater-than-or-equal. A tick exactly 12 hours after the last manual run is allowed to run.

## Timezone

All timestamps are recorded and compared in **UTC**. No local timezone, no DST handling. The runtime stores `T_last_manual` as a UTC timestamp; the cron schedule is expressed in UTC; the comparison subtracts UTC from UTC.

This matches the repo-wide convention noted in `CLAUDE.md` ("For GitHub Actions workflows, always consider timezone differences when adding scheduled cron jobs. Document the timezone conversion in comments.") and avoids the DST edge cases that would otherwise let one tick per spring/autumn slip past or block the gate.

## "Successful manual run" — definition

`T_last_manual` is the timestamp at which a *successful* manual run finished. A run is successful when:

1. The agent completed without raising a hard error.
2. The drift report was rendered.
3. Any PRs the agent intended to open were either opened or recorded as failed-to-open in the report.

A manual run that crashed before rendering the report does **not** update `T_last_manual`. The next scheduled tick is therefore not suppressed by a failed manual run — this is intentional, so an operator-side mishap does not silently block scheduled coverage.

## Where `T_last_manual` lives

The persistence location is open question #3 in `agents/doc-drift-agent/docs/plans/doc-drift-agent.md` — OpenClaw-local file, repo file, or external KV. This document is location-agnostic on purpose: whatever the runtime picks during Phase B Task B3, the decision rule above is computed from a single UTC timestamp. The store needs only:

- write on successful manual run completion,
- read on every scheduled tick,
- atomicity sufficient that a write cannot be partially observed by a concurrent read.

## Worked examples

Two reviewers reading these inputs must reach the same skip/run decision.

| `T_now` (UTC) | `T_last_manual` (UTC) | Diff | Decision |
|---------------|-----------------------|------|----------|
| 2026-05-09 06:00 | `null` | n/a | run |
| 2026-05-09 06:00 | 2026-05-08 18:01 | 11h 59m | suppress |
| 2026-05-09 06:00 | 2026-05-08 18:00 | 12h 00m | run |
| 2026-05-09 06:00 | 2026-05-09 02:15 | 3h 45m | suppress |
| 2026-05-10 06:00 | 2026-05-09 02:15 | 27h 45m | run |

## What the agent sees

The agent itself never reads or evaluates this gate. The runtime suppresses the invocation entirely, and the agent has no record of suppressed ticks. From the agent's perspective every invocation is a real run; from the maintainer's perspective the only observable effect of suppression is a missing scheduled run, which is expected behavior, not a defect.

## Out of scope

- Manual-run debouncing (a manual run during another manual run). Out of scope for this gate; the runtime's manual-trigger handler decides.
- Suppression of *manual* runs by prior scheduled runs. The gate is one-directional: scheduled runs suppress, manual runs do not.
- Holiday/quiet-hours scheduling. The cadence chosen in open question #4 is a separate concern.
