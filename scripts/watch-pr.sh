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

# Right after a push GitHub may not have registered the checks yet; gh then
# exits at once with "no checks reported". Retry that case for up to a minute.
for attempt in $(seq 1 12); do
    status=0
    gh pr checks "$pr" --watch --fail-fast "$@" > "$log" 2>&1 || status=$?
    if [[ $status -eq 0 ]] || ! grep -q "no checks reported" "$log"; then
        break
    fi
    sleep "${WATCH_PR_RETRY_DELAY:-5}"
done

echo "log: $log"
exit "$status"
