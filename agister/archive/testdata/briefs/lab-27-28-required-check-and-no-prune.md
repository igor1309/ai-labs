# LAB-27 and LAB-28: a PR merges on its own run; Agister prunes nothing

Two fixes. Confirm each in the code before changing it.

- **LAB-27, CI.** `.github/workflows/ci.yml` runs on every branch push and
  on `pull_request`, and both runs create a check named `report`, the only
  required check on `trunk`. A PR could merge on the push run's green
  `report` while its own run was still going. Give the aggregate job a
  name that is `report` only for `pull_request` and different otherwise
  (e.g. `report (push)`), so only a PR's own run satisfies the required
  check. CI keeps running on every push. Add a test to
  `scripts/tests/ci-workflow-paths.test.js` that the job is named `report`
  only for `pull_request`.
- **LAB-28, Agister.** `Discard` (`agister/internal/adapters/git/git.go`)
  ends with `git worktree prune`, which prunes every stale worktree record
  in the user's repository, not only the checkout being discarded.
  Agister must not manage the repository's git. Remove the prune. A
  `worktree remove` of a checkout whose directory is already gone must
  still not fail the discard; keep that behaviour. Update the comment.
  Test (in `git_test.go`, `t.TempDir()` repos): another worktree's stale
  record in the repository survives a `Discard`; discarding a checkout
  whose directory is gone still succeeds.

Use the quiet test commands from `agister/AGENTS.md` and
`node --test scripts/tests/ci-workflow-paths.test.js`; report each with
its exit code and final line, and list every file you changed.
