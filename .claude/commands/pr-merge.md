---
description: Create PR with auto-merge, watch CI, then FF local trunk and clean up the merged worktree and branch
---

Take the current branch through merge end-to-end:

1. **Create the PR.** `gh pr create` (it does NOT support `--auto`/`--merge`). Push
   first if there are unpushed commits.
2. **Enable auto-merge** as a separate step, repo convention:
   `gh pr merge <number> --merge --auto --delete-branch`
   (merge commit — never squash).
3. **Watch CI** using the `pr-ci-watch` skill — run `./scripts/watch-pr.sh <number>`,
   do not poll `gh pr checks` directly. If checks fail, stop and report; do not
   merge a red PR.
4. **On merge**, once GitHub reports the PR merged and the remote branch deleted:
   - `git fetch` then fast-forward local `trunk` to the merged remote
     (`git switch trunk && git merge --ff-only origin/trunk`, or update trunk
     without switching if you're in a worktree).
   - If the work was done in a git worktree, remove it: `git worktree remove <path>`.
   - Delete the now-merged local branch: `git branch -d <branch>`.

Report the PR URL, the final CI status, and what was cleaned up. If any step can't
complete (CI red, non-fast-forward, dirty worktree), stop at that step and say why —
do not force past it.
