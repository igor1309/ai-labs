# LAB-121 step 4: a seam for the watcher join

## Goal

`agister/testdata/briefs/lab-121-goal.md`

## Covers

- Fix item 3#1 of `code_review` run `20261007T132418Z-3af25c`: its
  regression test must be deterministic.

## Acts on

`gokit/supervisor/supervisor.go` (`Runtime.Run` and its watcher) and
`TestRunReturnsOnlyOnceItsWatcherHasEnded` in
`gokit/supervisor/supervisor_test.go`. Implement run
`20261007T133645Z-963053` added the join, but its notes say the test
cannot fail reliably when the join is removed: the outcome depends on
whether the watcher's last step loses the race to Run's last steps.

Root `AGENTS.md`: a behaviour no normal test can make fail means the code
lacks a seam; add the seam. Add one at the watcher's end (for example an
unexported hook or an injected callback the watcher calls before it
signals it is done, set only by tests in the package), so the test can
hold the watcher there and assert that Run has not returned while it is
held, and has returned once it is released. The test must fail every
time if the join is removed. Keep the existing fake process, clock and
events seams.

## Constraints

- No other behaviour change. Do not touch the export code.
- No mutation or revert checks to prove it.

## Open

None.
