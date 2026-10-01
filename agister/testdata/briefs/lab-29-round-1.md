# LAB-29: round 1 review fixes

The candidate makes worktree adds and removes in one repository run one at
a time (see `agister/testdata/briefs/lab-29-worktree-changes-one-at-a-time.md`;
code in `agister/internal/adapters/git/git.go`, tests in `serial_test.go`).
Review (run 20261001T063915Z-9b19b5) ruled four fixes:

1. Relative and absolute paths to one repository get different lock keys.
   Convert the common-directory path to an absolute path before resolving
   symlinks, handling the conversion error. Extend the existing gated test
   with a relative and an absolute path to the same repository.
2. The coordinator is a package global instead of being built at the
   composition root. Construct one shared coordinator at the process
   composition root (`cmd/agister/main.go`) and pass it explicitly to the
   workspace adapters. Keep the runner and wait-hook seams on that
   instance, so the tests no longer replace a production global.
3. The test harness leaks checkouts and unjoined workers on failure paths.
   Make the harness unblock and join its workers, release every successful
   checkout, and only then restore its state, all before repository
   cleanup. Register the release as cleanup when the checkout succeeds,
   not after the assertions.
4. Channel waits in the new tests have no local hang bound. Add a shared
   watchdog of at most one minute, used only to guard hangs (the package
   or its neighbours may already have one: reuse the idiom). Also observe
   worker results while awaiting gate events, so an early error is
   reported immediately.

Nothing else changes: still no file in the repository, no retry, no prune.
Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
