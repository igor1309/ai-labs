# LAB-23 and LAB-24: tests neither hang nor judge by wall time

Two review findings on tests, never ruled on; line numbers are from when
they were raised and may have moved. Confirm each in the code before
fixing; where one does not hold, say so and change nothing for it.

- **LAB-23:** `TestCancelInterruptsAndReleases`
  (`agister/internal/app/calls_test.go`) waits unconditionally on the
  runner spy's started channel, which only `runnerSpy.RunTurn` closes. A
  call that fails before starting its runner (e.g. a resolution refusal)
  never closes it, so the test waits for the test binary's 10-minute
  timeout instead of failing. Select between startup, early completion and
  a short hang guard, and register the cancellation cleanup right after
  submission.
- **LAB-24:** three tests in `agister/cmd/agister/verify_loop_test.go`
  (among them `TestVerifyCallTimeoutBoundsTheLoop` and the cancellation
  test) fail an otherwise correct outcome when elapsed wall time exceeds
  15 or 20 seconds. Remove those verdicts; keep a deadline only to end a
  hung wait. Where an elapsed-time check is the only proof of a behaviour
  (e.g. that a timeout cut the loop short), prove it through a seam
  instead (the injected clock, a spy, a hook), adding the seam if missing.

Search both packages for other tests of the same two kinds and fix them
the same way. No test may depend on timing to pass; a hang guard only
stops a broken test.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
