---
description: Create a PR, enable merge-commit auto-merge, wait for CI, and clean up
model: claude-haiku-4-5-20251001
allowed-tools:
  - Bash(gh:*)
  - Bash(git:*)
  - Bash(./scripts/watch-pr.sh:*)
  - Bash(./scripts/finish-merged-pr.sh:*)
---

Complete the current branch's PR lifecycle:

1. A branch does not need to include the latest trunk to merge. Do not
   merge trunk just because the branch is behind. If GitHub reports merge
   conflicts, fetch origin and merge `origin/trunk` (never rebase), resolve
   the conflicts while preserving each side's intent, and run the checks
   covering the merge changes before pushing. Stop and report when the
   sides contradict each other and choosing between them is a product call.
2. Push if there are unpushed commits. Trunk advancing while CI runs does
   not require a branch update or another CI run.
3. Create a PR with `gh pr create` and record its number and URL.
4. If the branch is stacked on another unmerged PR's branch, stop after
   step 3 and report. After the PR below merges, target trunk and resolve
   conflicts if any; do not merge trunk solely for freshness. Otherwise enable merge-commit
   auto-merge:

   ```sh
   gh pr merge <number> --merge --auto --delete-branch
   ```

5. Watch CI with `./scripts/watch-pr.sh <number>`. If CI fails, stop and report
   the failure. Never merge a red PR. If it exits 3 (a check queued with no
   runner) or 4 (checks still pending at its limit), stop and report the
   check it names.
6. After GitHub reports the PR merged and the remote feature branch deleted, run:

   ```sh
   ./scripts/finish-merged-pr.sh <feature-branch>
   ```

   Stop if the script reports a dirty worktree, non-fast-forward, or any other
   unsafe condition. Do not force past it.
7. Report the PR URL, final CI status, trunk update, and cleanup result.

## Definition of Done

- The PR URL is reported.
- The PR merged using a merge commit; no squash or rebase merge.
- Required CI completed successfully.
- Local `trunk` is fast-forwarded to `origin/trunk`.
- The local feature branch is deleted.
- The remote feature branch is deleted.
- The feature worktree is removed when applicable.
- No force merge, force deletion, or discarded untracked work was performed.
- If any step is blocked, the reason is reported and no later cleanup is attempted.
