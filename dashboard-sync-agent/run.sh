#!/usr/bin/env bash
# Daily dashboard sync, run by a bb script automation.
#
# Checks out origin/trunk into a throwaway worktree, runs sync.js there, and on
# drift force-updates the stable branch dashboard-sync/daily and opens or
# updates its PR. Never merges. Prints the notification summary only on drift
# or error, so a clean run is silent.
#
# Usage: dashboard-sync-agent/run.sh [--loc-threshold=<N>]
#   REPO   checkout to fetch into (default: the repo this script lives in)
set -euo pipefail

REPO=${REPO:-$(cd "$(dirname "$0")/.." && git rev-parse --show-toplevel)}
BRANCH=dashboard-sync/daily
GH_REPO=igor1309/ai-labs

work=$(mktemp -d "${TMPDIR:-/tmp}/dashboard-sync.XXXXXX")
cleanup() {
  git -C "$REPO" worktree remove --force "$work/tree" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

stamp=$(date -u +"%Y-%m-%d %H:%M UTC")
fail() {
  printf '[dashboard-sync] scheduled · %s\n\nrun FAILED — %s\n' "$stamp" "$1"
  exit 1
}

git -C "$REPO" fetch --quiet origin trunk || fail "git fetch origin trunk failed"
git -C "$REPO" worktree add --quiet --detach "$work/tree" FETCH_HEAD || fail "worktree add failed"
cd "$work/tree"
commit=$(git rev-parse --short HEAD)

node dashboard-sync-agent/sync.js --write "$@" > "$work/report.json" || fail "sync.js exited $?"
drifted=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).drifted)' "$work/report.json")

pr_url=""
if (( drifted > 0 )); then
  git checkout --quiet -B "$BRANCH"
  git add scripts/loc-dashboard.sh docs/products.html docs/loc-dashboard.html
  git -c user.name="dashboard-sync" -c user.email="dashboard-sync@users.noreply.github.com" \
    commit --quiet -m "sync dashboards with registry" || fail "commit failed"
  # Lease against the remote branch as fetched now; absent branch means create.
  if git fetch --quiet origin "$BRANCH" 2>/dev/null; then
    lease="--force-with-lease=$BRANCH:$(git rev-parse FETCH_HEAD)"
  else
    lease="--force-with-lease=$BRANCH:"
  fi
  git push --quiet "$lease" origin "HEAD:refs/heads/$BRANCH" || fail "push to $BRANCH failed"

  title="[dashboard-sync] daily sync — $(date -u +%F)"
  node dashboard-sync-agent/sync.js pr-body "$work/report.json" "$commit" > "$work/body.md"
  number=$(gh pr list --repo "$GH_REPO" --state open --head "$BRANCH" --json number --jq '.[0].number // empty') \
    || fail "gh pr list failed"
  if [[ -n "$number" ]]; then
    gh pr edit "$number" --repo "$GH_REPO" --title "$title" --body-file "$work/body.md" >/dev/null \
      || fail "gh pr edit $number failed"
    pr_url="https://github.com/$GH_REPO/pull/$number"
  else
    pr_url=$(gh pr create --repo "$GH_REPO" --head "$BRANCH" --base trunk --title "$title" --body-file "$work/body.md") \
      || fail "gh pr create failed"
  fi
fi

node dashboard-sync-agent/sync.js summary "$work/report.json" "$stamp" "$pr_url"
