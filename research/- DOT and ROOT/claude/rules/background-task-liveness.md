---
date: 2026-08-21
model: claude-opus-5
description: "Waiting on a long-running background process: poll liveness every 5–10 min — a hung process never exits, so the completion notification never fires."
---

# Background Task Liveness

When you start a long-running background process — a build, a test run, CI, a
deploy, a data job — **do not rely on the completion notification alone.** The
harness only re-invokes you when the process *exits*. A hung or wedged process
never exits, so that notification never comes, and passive waiting leaves you
blind for as long as the hang lasts.

- **Check at least once every 5–10 minutes.** Never leave a long process
  unobserved between its start and its exit.
- **Poll often; wake rarely.** Keep the progress counters inside the monitor loop
  and `echo` only on a verdict — stall, exit, or a phase change you will act on.
  A quiet monitor is not a blind wait.
- **Silence is ambiguous** — "still running" and "hung" look identical. Judge by a
  signal that advances while healthy, never by the absence of an exit.
- **On a detected hang, act — don't keep waiting.** Never arm another blind wait
  against the same reproducible hang.
- **An action scheduled against a clock must re-verify its preconditions when it
  fires.** The context that scheduled it may be gone, and the state it assumed
  may have been replaced. Schedule the check, not the act.

Invoke the **background-task-liveness** dev-skill for the recipe: which signal to
poll per work type, poll intervals, the monitor shape, diagnosing a wedged build,
re-pointing on phase change, and keeping monitor state across a teardown.
