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

1. Bring the branch up to date first: `git fetch origin`, then
   `git merge origin/trunk` (a merge, never a rebase). If it conflicts,
   resolve it and go on: keep what each side meant, and never drop either
   side's work to make the conflict go away. Then run the checks that
   cover the conflicting files before pushing. Stop and report only when
   the two sides contradict each other and choosing between them is a
   product call.
2. Before every push, including pushes for later fixes, check for unfinished
   PR workflow runs on the current branch with `gh run list --branch
   <feature-branch> --event pull_request --limit 100 --json
   databaseId,status,url`. Include queued runs and runs on earlier commits,
   not just the current head. Paginate if needed so no unfinished run is
   missed. Wait for each unfinished run with `gh run watch <run-id>
   --exit-status`, in the background, and recheck until none remain. Do not
   cancel a run to make way for the push. If a run fails or is stuck, stop
   and report it; do not push past it.
   Then repeat step 1 to fetch and merge the latest `origin/trunk`, run the
   checks covering any merge changes, and push if there are unpushed
   commits. Do not rely on the branch update from the start of this workflow:
   trunk may have advanced while CI was running.
3. Create a PR with `gh pr create` and record its number and URL.
4. If the branch is stacked on another unmerged PR's branch, stop after
   step 3 and report: auto-merge waits until the PR below has merged and
   trunk is merged into this branch. Otherwise enable merge-commit
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
