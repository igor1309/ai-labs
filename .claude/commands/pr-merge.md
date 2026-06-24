---
description: Create PR with auto-merge, watch CI, then FF local trunk and clean up the merged worktree and branch
model: claude-haiku-4-5-20251001
allowed-tools:
  - Bash(gh:*)
  - Bash(git:*)
  - Bash(./scripts/watch-pr.sh:*)
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
4. **On merge**, once GitHub reports the PR merged and the remote branch deleted,
   reconcile local state. Start with `git fetch --prune origin`, then branch on
   *where you are running*. Detect a linked worktree with:
   `[ "$(git rev-parse --git-dir)" != "$(git rev-parse --git-common-dir)" ]`
   (true ⇒ you are inside a linked worktree, not the main tree).

   **Main working tree** (the common case):
   - `git switch trunk`
   - `git merge --ff-only origin/trunk`
   - `git branch -d <branch>`

   **Inside the feature's worktree** — do NOT `git switch trunk` here: trunk is
   checked out in another worktree, so the switch fails, and switching would change
   *this* tree anyway. Instead:
   - Find trunk's home tree from `git worktree list` (the entry on `[trunk]`).
   - Fast-forward trunk there without leaving your tree:
     `git -C <trunk-worktree> merge --ff-only origin/trunk`. (Only if trunk is
     checked out in *no* worktree, `git fetch origin trunk:trunk` works instead —
     it is rejected while trunk is checked out, which is why the `-C` form is the
     default.)
   - Step out before removing this tree: `cd <trunk-worktree>` — your shell cwd
     cannot sit inside a worktree you are about to remove.
   - Remove the feature worktree: `git worktree remove <feature-worktree-path>`
     (add `--force` only for your own disposable untracked artifacts you have
     confirmed are safe to lose).
   - Delete the branch: `git branch -d <branch>`.

   Never `git switch trunk` from inside another worktree, never `git worktree remove`
   the tree you are standing in, and never force past a non-fast-forward. If any of
   these cannot proceed cleanly, stop at that point and report which and why.

Report the PR URL, the final CI status, and what was cleaned up. If any step can't
complete (CI red, non-fast-forward, dirty worktree), stop at that step and say why —
do not force past it.
