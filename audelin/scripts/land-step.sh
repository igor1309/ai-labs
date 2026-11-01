#!/bin/sh
# Lands a reviewed step: merges origin/trunk, gates, pushes, opens the PR if
# there is none, and lands it with land-pr.sh. When trunk moves while the
# PR's checks run, the merge is refused as behind, so it merges and gates
# again, up to four tries (2026-10-28, PRs 1365, 1367). Once trunk's CI passes
# on the merge, it removes the worktree with finish-merged-pr.sh, run from
# the worktree, and marks the Multica issue done.
#
#   land-step.sh <issue> <title>
#
# Run from the step's worktree with its work committed.

issue=$1
title=$2
[ -n "$issue" ] && [ -n "$title" ] || { echo "usage: land-step.sh <issue> <title>" >&2; exit 2; }
[ -z "$(git status --porcelain)" ] || { echo "STOP: uncommitted work" >&2; exit 1; }
here=$(cd "$(dirname "$0")" && pwd)
main=$(git worktree list --porcelain | awk 'NR == 1 { print $2 }')
branch=$(git rev-parse --abbrev-ref HEAD)
export MULTICA_WORKSPACE_ID=${MULTICA_WORKSPACE_ID:-4bffb154-c309-4416-917d-22a9fb2b5950}

for try in 1 2 3 4; do
    git fetch -q origin && git merge -q --no-edit origin/trunk || { echo "STOP: merge of origin/trunk failed" >&2; exit 1; }
    "$here/gate-step.sh" || exit 1
    git push -q -u origin "$branch" || exit 1
    # Only an open PR: a reused branch name also has merged ones (PR 1343).
    pr=$(gh pr list --head "$branch" --state open --json number --jq '.[0].number')
    [ -n "$pr" ] || pr=$(gh pr create --base trunk --title "$title" --body "$issue" | sed 's|.*/||')
    "$main/scripts/land-pr.sh" "$pr" && break
    # Merged with trunk's CI red: a trunk fault to look into, not a retry.
    [ "$(gh pr view "$pr" --json state --jq .state)" = MERGED ] \
        && { echo "STOP: PR #$pr merged but trunk CI is red; worktree kept" >&2; exit 1; }
    [ "$(gh pr view "$pr" --json mergeStateStatus --jq .mergeStateStatus)" = BEHIND ] && [ $try -lt 4 ] \
        || { echo "STOP: PR #$pr did not land"; exit 1; }
    echo "PR #$pr is behind trunk; merging and gating again"
done
"$main/scripts/finish-merged-pr.sh" "$branch" || exit 1
multica issue status "$issue" done
