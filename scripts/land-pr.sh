#!/usr/bin/env bash
set -euo pipefail

# Lands a PR from its branch's worktree: refuses a branch behind trunk,
# watches the PR's checks, merges with a merge commit, then watches trunk's
# CI on the merge commit. Each outcome goes to ntfy on the topic in
# ~/.config/ntfy/topic. Exits 0 only when trunk's run on the merge passed.
# Then run finish-merged-pr.sh <branch>.

[[ $# -eq 1 ]] || { echo "usage: $(basename "$0") <pr-number>" >&2; exit 2; }
pr="$1"
trunk=trunk
here=$(dirname "$0")
topic=$(cat "$HOME/.config/ntfy/topic" 2>/dev/null || true)
title=$(gh pr view "$pr" --json title --jq .title)

notify() {
    echo "$1"
    [[ -z "$topic" ]] || curl -fsS -m 10 -d "$1" "https://ntfy.sh/$topic" > /dev/null || echo "ntfy failed" >&2
}

git fetch -q origin
if ! git merge-base --is-ancestor "origin/$trunk" HEAD; then
    echo "refusing: branch is behind origin/$trunk; merge it, gate, push, then land" >&2
    exit 1
fi
[[ "$(git rev-parse HEAD)" == "$(gh pr view "$pr" --json headRefOid --jq .headRefOid)" ]] \
    || { echo "refusing: local HEAD is not the PR head; push first" >&2; exit 1; }

"$here/watch-pr.sh" "$pr" || { notify "PR #$pr red, not merged: $title"; exit 1; }
gh pr merge "$pr" --merge
[[ "$(gh pr view "$pr" --json state --jq .state)" == MERGED ]] \
    || { notify "PR #$pr did not merge: $title"; exit 1; }
merge=$(gh pr view "$pr" --json mergeCommit --jq .mergeCommit.oid)

# Wait for trunk's CI run on the merge commit to appear and finish.
for _ in $(seq 1 240); do
    runs=$(gh run list --branch "$trunk" --commit "$merge" --json status,conclusion --limit 50)
    if [[ "$(jq length <<<"$runs")" -gt 0 && "$(jq '[.[] | select(.status != "completed")] | length' <<<"$runs")" -eq 0 ]]; then
        if [[ "$(jq '[.[] | select(.conclusion != "success" and .conclusion != "skipped")] | length' <<<"$runs")" -eq 0 ]]; then
            notify "PR #$pr merged, trunk CI green: $title"
            exit 0
        fi
        notify "PR #$pr merged, trunk CI RED on ${merge:0:8}: $title"
        exit 1
    fi
    sleep "${LAND_PR_INTERVAL:-30}"
done
notify "PR #$pr merged, trunk CI did not finish in 2 h: $title"
exit 4
