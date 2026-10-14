# LAB-37–40: branch review round 3 fixes

The branch review (run 20261001T095341Z-f1a8c5) of this branch ruled these
fixes. Make each as written; change nothing else.

- **Test the guard that keeps a checkout when running runs cannot be
  listed.** Make the `LiveCheckouts` error injectable in the app test spy
  (`spies_test.go`). Test: `Abandoned` returns an unfinished run with a
  checkout, `LiveCheckouts` fails while the context stays active, adoption
  succeeds; the finished record keeps the checkout in `Unreleased`, and a
  later reap (with `LiveCheckouts` succeeding) removes it and clears the
  marker.
- **The killed-holder test always joins its second-acquirer worker.** When
  it starts the worker, register right away a `t.Cleanup` that cancels it
  and joins it under the existing hang guard (or start it through the
  existing managed-worker helper).

Tests are committed and deterministic: no wall-time waits beyond a hang
guard, no mutation or revert checks. Use the quiet test commands from
`agister/AGENTS.md`; report each with its exit code and final line, and
list every file you changed.
