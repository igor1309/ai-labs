---
description: Create a PR, enable merge-commit auto-merge, wait for CI, and clean up
model: claude-haiku-4-5-20251001
allowed-tools:
  - Bash(gh:*)
  - Bash(git:*)
  - Bash(./scripts/watch-pr.sh:*)
  - Bash(./scripts/finish-merged-pr.sh:*)
---

Complete the current branch's PR lifecycle. The feature branch must be a
non-detached branch other than `trunk`, with commits ahead of `trunk`.

1. Verify the preconditions above. If the branch has no upstream, push it with
   `git push -u origin <feature-branch>`; otherwise push normally and verify the
   push succeeds.
2. Create a PR with `gh pr create` and record its number and URL.
3. Enable merge-commit auto-merge:

   ```sh
   gh pr merge <number> --merge --auto --delete-branch
   ```

4. Watch required CI with `./scripts/watch-pr.sh <number>`. If checks fail, stop
   and report the failure.
5. CI success is not merge completion. Poll the PR until GitHub reports it as
   merged, for example:

   ```sh
   gh pr view <number> --json state,mergedAt,headRefName
   ```

   Stop unless `state` is `MERGED` and `mergedAt` is present. Do not proceed
   with cleanup while the PR is open, awaiting approval, queued, or otherwise
   unmerged.
6. After the PR is merged and the remote feature branch is deleted, run:

   ```sh
   ./scripts/finish-merged-pr.sh <feature-branch>
   ```

   Stop if the script reports a dirty worktree, non-fast-forward, or any other
   unsafe condition. Do not force past it.
   Cleanup is delegated to this helper; never bypass it with ad-hoc branch or
   worktree deletion.
7. Report the PR URL, final CI status, trunk update, and cleanup result.

## Definition of Done

- The PR URL is reported.
- The PR merged using a merge commit; no squash or rebase merge.
- Required CI completed successfully.
- The PR was explicitly verified as `MERGED` after CI completed.
- Local `trunk` is fast-forwarded to `origin/trunk`.
- The local feature branch is deleted.
- The remote feature branch is deleted.
- The feature worktree is removed when applicable.
- No force merge, force deletion, or discarded untracked work was performed.
- If any step is blocked, the reason is reported and no later cleanup is attempted.
