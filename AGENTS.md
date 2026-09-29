# AGENTS

## Pull request merge workflow

- For the `pr-merge` workflow, use `scripts/watch-pr.sh` to monitor CI and
  `scripts/finish-merged-pr.sh` to complete local cleanup.
- Use a merge commit only; do not squash or rebase-merge.
- Never merge a red or incomplete PR. Stop and report the failure if required
  CI fails.
- Stop if cleanup reports a dirty worktree, a non-fast-forward update, or any
  other unsafe condition. Never force past the check.
- Do not force-merge, force-delete branches, or discard untracked work.

## Verifying fixes

- Prove a fix with a regular, committed test: set up a temp directory
  (`t.TempDir()`), put the bad input there, and assert the expected failure.
- Do not verify by hand by planting broken files and running the binary;
  that is expensive, unreliable, and never runs again.
- Check that the new test fails with the fix reverted, deterministically:
  write each revert as a mutation in a committed spec (for agister,
  `agister/testdata/revert-checks/*.spec`) and run
  `scripts/revert-check.py <spec>`. It checks the tests pass, applies each
  mutation, requires them to fail (a mutation that does not build proves
  nothing), and restores the file. Do not revert by hand.

## Implementation and review

- Delegate implementation runs to a subagent on Sonnet 5.5. Brief it with
  the plan; it delivers the tests and a revert-check spec with them. Verify
  its result yourself: the tests pass and `scripts/revert-check.py` catches
  every mutation; do not rely on the subagent's own report of revert checks.
- Have Codex review the result critically:
  `codex exec --sandbox read-only -m gpt-6-sol -c model_reasoning_effort="high" "<prompt>" < /dev/null`.
- Keep the loop tight: at most 2 review rounds. Judge each finding; fix
  what belongs to the issue, and record the rest in the project's deferred
  work (for agister, `agister/docs/deferred.md`) instead of another round.
