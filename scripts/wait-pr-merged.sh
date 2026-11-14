#!/usr/bin/env bash
set -euo pipefail

# Waits, after watch-pr.sh passed, until auto-merge lands the PR (exit 0).
# It stops with exit 1 when the PR is closed, 5 when it conflicts with its
# base, 6 when it has no auto-merge set on two polls in a row, and 4 after
# WAIT_PR_MERGED_LIMIT seconds (default 10 min), naming GitHub's merge
# state.

[[ $# -eq 1 ]] || { echo "usage: $(basename "$0") <pr-number>" >&2; exit 2; }
pr="$1"
limit="${WAIT_PR_MERGED_LIMIT:-600}"
interval="${WAIT_PR_MERGED_INTERVAL:-10}"
started=$(date +%s)
merge_state="unknown"
no_auto=0
failed_calls=0

while true; do
    if (($(date +%s) - started >= limit)); then
        echo "not merged after ${limit}s; merge state: $merge_state" >&2
        exit 4
    fi
    view=$(gh pr view "$pr" --json state,mergeable,mergeStateStatus,autoMergeRequest 2>&1) || {
        if ((++failed_calls >= ${WAIT_PR_MERGED_GH_RETRIES:-10})); then
            echo "gh failed $failed_calls times in a row: $view" >&2
            exit 1
        fi
        sleep "$interval"
        continue
    }
    failed_calls=0
    merge_state=$(jq -r .mergeStateStatus <<< "$view")
    case "$(jq -r .state <<< "$view")" in
        MERGED) echo "PR $pr merged"; exit 0 ;;
        CLOSED) echo "PR $pr is closed without merging" >&2; exit 1 ;;
    esac
    if [[ "$(jq -r .mergeable <<< "$view")" == CONFLICTING || "$merge_state" == DIRTY ]]; then
        echo "PR $pr conflicts with its base: merge the base in, resolve and push" >&2
        exit 5
    fi
    # The PR may merge between gh's answers, so one poll without auto-merge
    # is checked again before it counts.
    if jq -e '.autoMergeRequest == null' > /dev/null <<< "$view"; then
        if ((++no_auto >= 2)); then
            echo "PR $pr has no auto-merge set; merge state: $merge_state" >&2
            exit 6
        fi
    else
        no_auto=0
    fi
    sleep "$interval"
done
