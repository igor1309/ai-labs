#!/usr/bin/env bash
set -euo pipefail

# Watches a PR's checks until they all pass (exit 0) or one fails (exit 1).
# A watch never holds forever: it stops with exit 3 when a check has waited
# for a runner longer than WATCH_PR_QUEUE_LIMIT seconds (default 15 min),
# naming it, and with exit 4 after WATCH_PR_LIMIT seconds (default 90 min).

if [[ $# -lt 1 ]]; then
    echo "usage: $(basename "$0") <pr-number> [extra gh pr checks args...]" >&2
    exit 2
fi

pr="$1"
shift

repo=$(basename "$(git rev-parse --show-toplevel)")
log="/tmp/${repo}-pr-${pr}.log"
: > "$log"

queue_limit="${WATCH_PR_QUEUE_LIMIT:-900}"
limit="${WATCH_PR_LIMIT:-5400}"
interval="${WATCH_PR_INTERVAL:-30}"
started=$(date +%s)

finish() {
    echo "log: $log"
    exit "$1"
}

# Right after a push GitHub may not have registered the head commit's
# workflow runs yet: gh then fails with "no checks reported", or still shows
# the checks of the commit before. Either case is retried for up to a
# minute, and the checks pass only once the head commit's own runs have
# all completed.
unregistered=0
not_registered() {
    echo "$1" >> "$log"
    if ((++unregistered < 12)); then
        sleep "${WATCH_PR_RETRY_DELAY:-5}"
        return
    fi
    finish 1
}
while true; do
    checks=$(gh pr checks "$pr" --json name,state,bucket,startedAt "$@" 2>&1) || true
    if ! jq -e 'type == "array"' > /dev/null 2>&1 <<< "$checks"; then
        grep -q "no checks reported" <<< "$checks" || {
            echo "$checks" >> "$log"
            finish 1
        }
        not_registered "$checks"
        continue
    fi
    head=$(gh pr view "$pr" --json headRefOid --jq .headRefOid)
    runs=$(gh run list --commit "$head" --json status --limit 100)
    if ! jq -e 'length > 0' > /dev/null <<< "$runs"; then
        not_registered "no workflow runs for $head yet"
        continue
    fi
    runs_done=$(jq 'all(.[]; .status == "completed")' <<< "$runs")

    now=$(date +%s)
    # A queued check's startedAt is when it was queued; a commit status
    # that has not started has none.
    verdict=$(jq -r --argjson now "$now" --argjson limit "$queue_limit" --argjson runs_done "$runs_done" '
        def waited: (.startedAt // "") | if startswith("20") then $now - fromdateiso8601 else 0 end;
        def names(f): [.[] | select(f) | .name] | join(", ");
        if any(.[]; .bucket == "fail" or .bucket == "cancel") then
            "fail\t" + names(.bucket == "fail" or .bucket == "cancel")
        elif $runs_done and all(.[]; .bucket == "pass" or .bucket == "skipping") then "pass\t"
        elif any(.[]; .state == "QUEUED" and waited > $limit) then
            "stuck\t" + names(.state == "QUEUED" and waited > $limit)
        elif any(.[]; .bucket == "pending") then "pending\t" + names(.bucket == "pending")
        else "pending\tthe head commit'"'"'s workflow runs"
        end' <<< "$checks")
    state="${verdict%%$'\t'*}"
    names="${verdict#*$'\t'}"
    echo "$(date -u +%H:%M:%SZ) $state $names" >> "$log"

    case "$state" in
        pass) finish 0 ;;
        fail)
            echo "failed: $names" >&2
            finish 1
            ;;
        stuck)
            echo "queued over ${queue_limit}s with no runner: $names" >&2
            finish 3
            ;;
    esac
    if ((now - started >= limit)); then
        echo "still pending after ${limit}s: $names" >&2
        finish 4
    fi
    sleep "$interval"
done
