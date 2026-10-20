Complete the current branch's PR lifecycle.

1. Bring the branch up to date first: `git fetch origin`, then
   `git merge origin/trunk` (a merge, never a rebase). If it conflicts,
   stop and report the conflicting files; do not resolve them by
   discarding either side.
2. Push the current branch if it has unpushed commits.
3. Create a PR with `gh pr create` and record its number and URL.
4. Enable merge-commit auto-merge:

   ```sh
   gh pr merge <number> --merge --auto --delete-branch
   ```

5. Watch CI with `./scripts/watch-pr.sh <number>`. If CI fails, stop and report
   the failure. Never merge a red PR.
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
