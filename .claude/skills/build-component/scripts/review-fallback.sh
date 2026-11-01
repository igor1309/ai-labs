#!/bin/sh
# Run code_review's five reviewers one at a time on claude-opus, for when
# Codex is limited. code_review pins them to Codex and its judge needs all
# five, so weigh the findings yourself.
# Usage: review-fallback.sh <goal.md> <worktree> <log-dir> [base]
set -u
goal=$1 dir=$2 logs=$3 base=${4:-origin/trunk}
here=$(dirname "$0")
for process in adversarial_review intent_review architecture_review clarity_review tests_review; do
    agister run --process "$process" --agent claude-opus \
        --param goal="$goal" --param base="$base" --param candidate=HEAD \
        --dir "$dir" < /dev/null > "$logs/review-$process.log" 2>&1
    echo "== $process"
    python3 "$here/agister-result.py" "$logs/review-$process.log"
done
