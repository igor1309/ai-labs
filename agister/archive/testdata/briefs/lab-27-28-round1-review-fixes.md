# LAB-28: round 1 review fix

One ruling; confirm it before fixing.

- **The new Discard test has no cleanup for its checkout if the test
  fails.** In `TestDiscardLeavesOtherStaleWorktreesAlone`
  (`agister/internal/adapters/git/git_test.go`), register a `t.Cleanup`
  right after `Checkout` succeeds that removes `filepath.Dir(checkout)`
  whether or not `Discard` ran.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
