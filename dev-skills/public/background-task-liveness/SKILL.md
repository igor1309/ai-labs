---
name: background-task-liveness
author: Igor Malyarov
version: "1.0.0"
description: Use when supervising a long-running background process — a build, test run, CI pipeline, deploy, or data job — and you need to choose what to poll, how often, how to tell a slow run from a wedged one, and how to keep monitor state across a teardown. Triggers on "monitor the build", "is it still running", "the build is hanging", "watch the deploy", "poll CI", "arm a monitor", "wedged", "stalled", "no output for a while", "background task".
---

# Background Task Liveness

The rule that sends you here is short: a hung process never exits, so the
completion notification never fires, and you must look at least every 5–10
minutes. This is how to look.

## Pick a signal that advances while healthy

Silence is ambiguous — "still running" and "hung" look identical. Never poll for
the terminal event alone. Poll something that moves:

- **Local build/test**: output-file growth, emitted-object count, CPU on the
  worker subprocesses.
- **Remote CI/deploy**: job state transitions, the newest log timestamp, the
  current revision.
- **Data jobs**: rows/items processed, newest written partition.

No advance across two consecutive checks = treat as hung.

## Match the poll interval to the signal

- Local build/test progress: ~45–90s.
- Remote CI/deploy: 30s+ (rate limits).

The 5–10 minute ceiling from the rule is the **maximum time you may go without
looking**, not the poll period.

## Poll often, wake rarely

The monitor loop and the agent's attention are separate budgets. Keep the
progress counters *inside* the loop and `echo` only on a verdict — stall, exit,
or a phase change you will act on.

A healthy `echo` every poll wakes the agent at full context for no decision. On
one iOS lane run, 6 such heartbeats cost 1.17M tokens (5.6% of the session) and
produced 651 output tokens of "still building". A quiet monitor is not a blind
wait — the loop is still watching, it just has nothing to say.

## Diagnosing a wedged build

**A wedged coordinator has no busy children.** The tell is the parent alive at
0% CPU with zero compiler/linker/test subprocesses and a frozen artifact count —
distinct from a slow build, which always has children burning CPU. Verify
children, not just the parent.

Observed on an `xcodebuild` TestHost build: it wedged in `SWBBuildService` at a
fixed point and produced no exit. Trusting the completion event cost ~100
minutes of blind wait across repeats before the stall was even noticed.

## Re-point the monitor on phase change

A long process moves between surfaces as it changes phase — design artifacts,
then build output, then deploy state. A monitor fixed on a later phase's surface
reports silence that is *your blindness*, not the process's stall. Name the
current phase's surface when you arm it, and re-point when the phase changes.

## Make the monitor's state outlive the monitor

Persist counters (consecutive-quiet count, last-seen marker) to a file. A
teardown silently resets them, and "no stall detected" after a restart is
indistinguishable from healthy.

Prefer **absolute** signals — current revision, item count, newest timestamp —
over a sampling window: a poll interval that drifts past its window manufactures
false quiet.

## On a detected hang

Diagnose the stuck stage, kill cleanly, recover (clear corrupt build state), and
retry or report. Do not arm another blind wait against the same reproducible
hang.
