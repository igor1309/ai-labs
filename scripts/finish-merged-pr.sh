#!/usr/bin/env bash
set -euo pipefail

[[ $# -eq 1 ]] || { echo "usage: $(basename "$0") <feature-branch>" >&2; exit 2; }
branch="$1"
trunk=trunk
repo_root=$(git rev-parse --show-toplevel)
git_dir=$(git rev-parse --git-dir)
common_dir=$(git rev-parse --git-common-dir)

[[ -z "$(git status --porcelain)" ]] || { echo "refusing cleanup: current worktree is dirty" >&2; exit 1; }
git fetch --prune origin

if [[ "$git_dir" == "$common_dir" ]]; then
    git switch "$trunk"
    git merge --ff-only "origin/$trunk"
    git branch -d "$branch"
    echo "updated $trunk and deleted local branch $branch"
    exit 0
fi

trunk_worktree=$(git worktree list --porcelain | awk -v target="refs/heads/$trunk" '
    /^worktree / { path=$2 }
    /^branch / && $2 == target { print path; exit }
')
[[ -n "$trunk_worktree" ]] || { echo "refusing cleanup: could not find worktree containing $trunk" >&2; exit 1; }
[[ -z "$(git -C "$trunk_worktree" status --porcelain)" ]] || { echo "refusing cleanup: trunk worktree is dirty: $trunk_worktree" >&2; exit 1; }

git -C "$trunk_worktree" merge --ff-only "origin/$trunk"
cd "$trunk_worktree"
git worktree remove "$repo_root"
git branch -d "$branch"
echo "updated $trunk, removed worktree $repo_root, and deleted local branch $branch"
