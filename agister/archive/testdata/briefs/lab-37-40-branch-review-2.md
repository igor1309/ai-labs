# LAB-37–40: branch review round 2 fixes

The branch review (run 20261001T093907Z-be1937) of this branch ruled these
fixes. Make each as written; change nothing else.

- **A checkout a reap could not remove stays eligible for another reap.**
  When the reaper cannot discard an unfinished run's checkout (for example
  the cleanup deadline passes while another process holds the worktree
  lock), it records that checkout in `Effects.Unreleased` before finishing
  the run, so a later reap lists the run and removes it. Deterministic test
  with the existing deadline seam and a `t.TempDir()` filesystem run store:
  the first reap's removal fails; a second reap removes the checkout and
  clears the marker.
- **The killed-holder test goes through the production lock forwarding.**
  `TestAKilledHoldersLockLastsAsLongAsItsGitChild` must start its held
  child through the production path that hands the lock descriptor to git
  (`runHolding`/`runFiles` or whatever it is now), with the executable or
  command injected through a seam, while keeping the `Git` seam. The test
  must fail if production stops forwarding the descriptor.

Tests are committed and deterministic: no wall-time waits beyond a hang
guard, no mutation or revert checks. Use the quiet test commands from
`agister/AGENTS.md`; report each with its exit code and final line, and
list every file you changed.
