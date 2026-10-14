# LAB-29: round 2 review fixes

The candidate serializes worktree adds and removes per repository through
one coordinator built in `cmd/agister/main.go` (see the two earlier LAB-29
briefs beside this one). Review (run 20261001T064854Z-6b348e) ruled four
fixes:

1. A cancelled Copy waits again without cancellation. Track whether the
   add started. When cancellation precedes it, remove only the newly
   created parent directory and skip the redundant git cleanup, including
   the verifier's deferred Discard. Extend the gated cancellation test to
   assert that Copy returns before the held command is released.
2. `TestDifferentRepositoriesDoNotWaitOnEachOther` can fail on correct
   behaviour. Remove the race: hold both commands at the gate until their
   entry events are asserted, then pass both and await their results. Keep
   the runner and wait seams, and the bounded failure when repositories
   wrongly share a lock.
3. The shared coordinator wiring has no deterministic regression test. Add
   an instance-owned wiring seam and a normal test that holds a caller
   checkout while the verifier's Copy and the reaper's Discard report
   waiting on the same coordinator.
4. `Workspaces` depends on the concrete `Worktrees` coordinator. Declare a
   Workspaces-owned interface with the single worktree-command capability
   and use it for the field and the constructor parameter (ADR-001 rule
   13; the archtest flags field names that collide with interface names).
   Keep the shared concrete coordinator and its test seams.

No timing, no mutation or revert check. Use the quiet test commands from
`agister/AGENTS.md`; report each with its exit code and final line, and
list every file you changed.
