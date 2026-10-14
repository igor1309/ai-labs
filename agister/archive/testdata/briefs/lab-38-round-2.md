# LAB-38: round 2 review fixes

The code review (run 20261001T090343Z-0c1338) of this branch ruled these
fixes, and the owner chose option (a) for its owner item. Make each as
written; change nothing else.

- **A release that hits the cleanup deadline is reaped later.** When a
  call's checkout release fails (today only the `WORKSPACE_RELEASE_FAILED`
  event says so), the finished run's record names that checkout as still
  to be removed, in a field of `run.Effects` distinct from `Checkout` (old
  finished records, which all keep `Checkout`, must not become reapable).
  A release that succeeds records nothing new. The run adopter lists a
  finished run that names such a checkout, as it does one that names a
  clean copy, and the reaper discards it the same way: through
  `CheckoutDiscarder.Discard`, left alone when a live run records that
  directory, and cleared from the record once removed. Tests: a call whose
  release fails with the deadline leaves a finished run that names the
  checkout; a reap after the lock is free removes it and clears it; a
  finished run with only `Checkout` on record is not listed.
- **ADR-008** states the rule: a release that does not get the lock within
  the cleanup bound is recorded on its run and removed by a later reap.
  A rule, not a story.
- **Test Discard's bound and the default.** A controlled-expiry test calls
  `Discard` with `context.Background()` while another coordinator holds
  the repository lock, and asserts it returns at the injected deadline.
  A cheap test checks that the default cleanup context carries a deadline
  of one minute, without waiting for it.
- **The exclusion test watches for a second entry while it waits.** Select
  on the waiting notification, an unexpected second entry and the worker
  results together; keep the deadline only as a hang guard.
- **The deadline test never leaves its checkout behind.** Capture the
  checkout path and register cleanup right away; in it, open and join the
  holders first, then discard the checkout through a fresh, unexpired
  cleanup context.

Tests are committed and deterministic: injected clock, timer or deadline,
no wall-time waits beyond a hang guard, no mutation or revert checks. Use
the quiet test commands from `agister/AGENTS.md`; report each with its exit
code and final line, and list every file you changed.
