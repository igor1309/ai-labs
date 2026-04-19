---
date: 2025-10-07
model: ChatGPT-5
---

# essential cheat sheet for work with new branch directly as a worktree

| Step | Command (copy-paste) | What it does / notes |
|---|---|---|
| 1. Fetch | `git fetch --all --prune` | Get latest refs before creating worktree. |
| 2. Create worktree & branch | `git worktree add -b feat/xyz ../wt-xyz origin/main` | New folder `../wt-xyz` on branch `feat/xyz` from `origin/main`. |
| 3. Enter | `cd ../wt-xyz` | Switch your shell/editor context to the new tree. |
| 4. Code | _(edit files)_ | Work normally inside this folder. |
| 5. Stage | `git add -A` | Stage all changes. |
| 6. Commit | `git commit -m "feat: implement xyz"` | Record your work. |
| 7. Push (set upstream) | `git push -u origin feat/xyz` | Publish the branch once; future pushes need just `git push`. |
| 8. Open PR | _(use GitHub/GitLab UI)_ | Create PR from `feat/xyz` → `main`; wait for CI/approval. |
| 9. Keep fresh (repeat as needed) | `git fetch --all --prune && git rebase origin/main` | Rebase your branch to avoid drift while PR is open. Also alias `git up origin/trunk`. |
| 10. After merge: remove tree | `cd - && git worktree remove ../wt-xyz` | Cleanly detach the folder from the repo. |
| 11. Prune records | `git worktree prune` | Remove stale worktree metadata. |
| 12. Delete local branch | `git branch -d feat/xyz` | Drop the now-merged local branch. |