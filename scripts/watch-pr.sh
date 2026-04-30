#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
    echo "usage: $(basename "$0") <pr-number> [extra gh pr checks args...]" >&2
    exit 2
fi

pr="$1"
shift

repo=$(basename "$(git rev-parse --show-toplevel)")
log="/tmp/${repo}-pr-${pr}.log"

status=0
gh pr checks "$pr" --watch --fail-fast "$@" > "$log" 2>&1 || status=$?

echo "log: $log"
exit "$status"
