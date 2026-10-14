# LAB-37–40: branch review fixes

The branch review (run 20261001T092244Z-e45432) of this branch ruled these
fixes. Make each as written; change nothing else.

- **A failed release is recorded as unreleased even when the checkout's
  record update failed.** In `agister/internal/app/calls.go`, keep the
  owned checkout reference apart from whether the record updates
  succeeded, and fill `Unreleased` from it after any failed release.
  Regression test: the fixture of
  `TestCheckoutThatCannotBeRecordedIsReleasedAndTheCallRefused` (its
  Update error) with `workspacesSpy.releaseErr = context.DeadlineExceeded`
  and `recorderSpy.finishErr` unset; the finished record carries the
  unreleased checkout.
- **The worktree lock lives as long as its git child.** If Agister is
  killed while `git worktree` runs, the file lock must not be released
  while git still runs: give the locked descriptor to the git child (for
  example through `exec.Cmd.ExtraFiles`), so the lock is held until both
  have exited. Keep the `Git` seam. Test with a subprocess (the test
  binary re-executed as the lock holder, standard Go helper-process
  pattern): the holder takes the lock and starts a held child; the test
  kills the holder; a second acquirer cannot get the lock until the child
  exits. Deterministic: the child exits on a signal from the test, not
  after a sleep.

Tests are committed and deterministic: no wall-time waits beyond a hang
guard, no mutation or revert checks. Use the quiet test commands from
`agister/AGENTS.md`; report each with its exit code and final line, and
list every file you changed.
