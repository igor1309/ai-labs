# AGENTS

## Issues

- `LAB-*` issues live in the Multica workspace `ai-labs`, which is not the
  CLI default: `multica --workspace-id 4bffb154-c309-4416-917d-22a9fb2b5950 issue get LAB-<n>`.

## Pull request merge workflow

- For the `pr-merge` workflow, use `scripts/watch-pr.sh` to monitor CI and
  `scripts/finish-merged-pr.sh` to complete local cleanup.
- Use a merge commit only; do not squash or rebase-merge.
- Never merge a red or incomplete PR. Stop and report the failure if required
  CI fails.
- Stop if cleanup reports a dirty worktree, a non-fast-forward update, or any
  other unsafe condition. Never force past the check.
- Do not force-merge, force-delete branches, or discard untracked work.

## Fixing a problem

- Fix the root cause in the issue's own PR. No stopgap with a follow-up
  issue where the cause can be fixed now.
- A PR closes the issue it names, whole.
- A check that fails or is slow (`-race`, a timeout, a required test) is
  kept: cut the work it checks, do not loosen the check.

## Verifying fixes

- Prove a fix with a regular, committed test: set up a temp directory
  (`t.TempDir()`), put the bad input there, and assert the expected failure.
- Do not verify by hand by planting broken files and running the binary;
  that is expensive, unreliable, and never runs again.
- Mutation tests are not welcome: no mutation specs, no revert checks, no
  reverting by hand. They are slow, load the machine, and prove nothing a
  normal test cannot.
- A behaviour no normal test can make fail means the code lacks a seam (an
  injected closure, spy, clock or hook). Add the seam.

## Reaching the owner

- When you need the owner and they are away, send one ntfy push:
  `curl -s -m 10 -H "Title: <short>" -H "Tags: bell" -d "<one-line ask>" "https://ntfy.sh/$(cat ~/.config/ntfy/topic)"`.
  The topic file is the one `~/.claude/hooks/limit-hit-ntfy.sh` uses.
- Push only for a real block or a decision that is the owner's: one ask per
  push. Keep working on whatever does not depend on the answer.

## Long waits

- Run anything that waits for minutes (a Codex review, a CI watch, a long
  test run) in the background, never as a foreground command. Act on its
  completion notice; do not poll its output.
