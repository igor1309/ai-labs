# LAB-38: round 1 review fixes

The code review (run 20261001T085051Z-ef8d3c) and the ADR review (run
20261001T085102Z-23c5e8) of this branch ruled these fixes. Make each as
written; change nothing else.

- **Bound the cleanup's wait on another process's worktree lock.** Removal
  and checkout release run under `context.WithoutCancel`, so a cleanup
  waiting on the file lock held by another process can wait forever. Give
  the cleanup and removal paths their own bounded context (a cleanup
  deadline, injectable as a seam on `Worktrees` or `Workspaces`; the
  default is one minute). Cleanup stays independent of the call's
  cancellation; keep the existing `Git`, `Waits` and `Pause` seams. Apply
  the same bound to the failed-copy cleanup only if it goes through the
  same lock wait. Test: two coordinators, one holding the lock; a checkout
  release on the other, with an injected short cleanup deadline, returns
  when the deadline expires and before the holder releases.
- **The lock-test harness never leaks a worker.** Before `newTurns` starts
  any worker, register a `t.Cleanup` that cancels their contexts, closes
  `release` exactly once and joins the workers under the existing hang
  guard.
- **Record the exception in a new ADR instead of editing ADR-001.** Revert
  the in-place addition to ADR-001. Add
  `agister/docs/adr/008-worktree-changes-take-turns.md` with the header
  format of ADR-003 (Status: Accepted, Date: 2026-10-01, Decision type:
  Architecture, Amends: ADR-001 rule 12). State the decision as rules, not
  a story: concurrent calls that share Agister's state directory take
  turns, through one lock file per repository (keyed by its git common
  directory) under that directory, for the git worktree commands that add
  and remove their checkouts; the lock file holds no state and no call
  reads another's; nothing is written in the repository or its `.git`; a
  cleanup's wait on the lock is bounded. State the limitation: calls with
  different `--home` values do not coordinate.

Tests are committed and deterministic: injected clock, timer or deadline,
no wall-time waits beyond a hang guard, no mutation or revert checks. Use
the quiet test commands from `agister/AGENTS.md`; report each with its exit
code and final line, and list every file you changed.
