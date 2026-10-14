# LAB-29: worktree changes in one repository run one at a time

Concurrent calls in one Agister process (a workflow's parallel reviews)
each run `git worktree add` in the same repository. Every add reads each
`.git/worktrees/*/commondir`; a parallel add creates that file empty
before writing it, so the reader dies: "fatal: failed to read
.git/worktrees/workspace-…/commondir: Undefined error: 0". Git 2.50–2.56
does not fix it. Observed: `TestCodeReviewCollectsItsFourReviews` fails
about 1 run in 80 with one review failed on that message.

Fix, in `agister/internal/adapters/git/git.go`: Agister's own worktree
changes in one repository run one at a time within the process.

- One lock per repository, keyed by the repository's git common directory
  (two paths into one repository, or two of its worktrees, share a lock).
- Process-wide: `cmd/agister/main.go` builds several separate
  `Workspaces{}` values, so the lock cannot live in a Workspaces value.
- It covers every worktree add and remove Agister runs: `Checkout`, its
  release, `Copy`, `Discard`. Only the git worktree command is under the
  lock, not `git apply` or the agent's work.
- Waiting for the lock respects the context: a cancelled or timed-out call
  stops waiting and returns the context's error. Release and Discard run
  on contexts without cancellation, as now.
- Agister does not manage the user's git: nothing is written to the
  repository or its `.git` (no lock file, no config, no prune), and no
  retry of git's error.

Out of scope: two Agister processes in one repository at once.

Tests, committed and deterministic (see the root `AGENTS.md`, "Verifying
fixes"): no timing, no repeat-until-it-fails, no mutation or revert check.
If the behaviour needs a seam (an injected git runner or hook), add it.
Prove: worktree commands of one repository never overlap; different
repositories do not wait on each other; two paths of one repository share
the lock; a cancelled context stops the wait.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
