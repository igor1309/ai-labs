---
date: 2025-10-08
model: gpt-5
purpose: Make multi-branch worktree flow fast, safe, and human.
version: 0.0.1
todo: fix Installation
---

# 🧩 `wt` — Multi-Worktree Branch Helper

A lightweight CLI to create and manage **Git worktrees** for feature, fix, chore, or release branches.  
Simplifies your workflow: one command = new branch + new worktree folder.

---

## 🧠 Concept

Each branch lives in its own folder (`../wt-<prefix>-<name>`).
No more `git checkout` flipping — just `cd` into the right directory.

---

## ⚙️ Installation

```bash
mkdir -p ~/bin
curl -o ~/bin/wt https://example.com/wt   # or copy the script manually
chmod +x ~/bin/wt
echo 'export PATH="$HOME/bin:$PATH"' >> ~/.bashrc
```

_(Adjust for zsh/fish if needed.)_

---

## 🚀 Usage

```bash
wt [--type feat|fix|chore|rel] [--base <remote/branch>] <name>
```

| Example | Description |
|----------|-------------|
| `wt auth` | Create `../wt-feature-auth` on branch `feature/auth` from `origin/trunk`. |
| `wt --type fix crash-login` | Create `../wt-fix-crash-login` on branch `fix/crash-login`. |
| `wt --type rel v1.2.0` | Create `../wt-release-v1.2.0` on branch `release/v1.2.0`. |
| `wt --type feat search --base origin/main` | Use `origin/main` as base (default is `origin/trunk`). |

---

## 🪄 What It Does

1. Verifies you're in a Git repo.
2. Fetches and prunes all remotes.
3. Creates new branch `<prefix>/<name>` (e.g., `feature/auth`).
4. Creates corresponding folder `../wt-<prefix>-<name>` (e.g., `wt-feature-auth`).
5. Adds the new worktree and checks it out.
6. Prints next steps (`cd`, commit, push).

---

## 🧹 Cleanup

When done:
```bash
git worktree remove ../wt-feature-auth
git branch -d feature/auth
git worktree prune
```

---

## ⚠️ Caveats

- Each worktree folder must be unique — the script refuses to overwrite.  
- Default base is `origin/trunk`. Override via `--base`.  
- No merge or rebase done automatically — manual workflow only.  
- Designed for Bash/zsh; for PowerShell, port logic to `.ps1`.