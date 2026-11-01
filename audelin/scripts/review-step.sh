#!/bin/sh
# Reviews a step's branch without touching it, through Agister's code_review.
# The base defaults to the branch's merge-base with origin/trunk, so the
# review shows only the branch's work and never reports trunk's newer work
# as removed (it did three times on 2026-10-27). Name a base to focus the
# review on the commits after it.
#
#   review-step.sh <goal.md> <output file> [base]
#
# Run from the step's worktree. Stops if the worktree has uncommitted work.
#
# If a reviewer hit model capacity or a rate limit, home's code_review is
# switched to one reviewer at a time, the owner is told through ntfy (when
# ~/.config/ntfy/topic exists), and the review runs once more (LAB-686).

goal=$1
out=$2
base=$3
[ -f "$goal" ] && [ -n "$out" ] || { echo "usage: review-step.sh <goal.md> <output file> [base]" >&2; exit 2; }
[ -z "$(git status --porcelain)" ] || { echo "STOP: uncommitted work" >&2; exit 1; }
if [ -z "$base" ]; then
    git fetch -q origin && base=$(git merge-base origin/trunk HEAD) || { echo "STOP: no merge-base with origin/trunk" >&2; exit 1; }
fi
review() { agister run code_review --param base="$base" --param candidate=HEAD --param goal="$goal" > "$out" 2>&1; }
review
grep -qE 'rate_limited|capacity' "$out" || exit 0

wf=${AGISTER_HOME:-$HOME/.agister}/workflows/code_review.yaml
if grep -qE 'max: [2-9]' "$wf" 2>/dev/null; then
    sed -i '' -E 's/max: [2-9]/max: 1/' "$wf"
    topic=$HOME/.config/ntfy/topic
    [ -f "$topic" ] && curl -s -o /dev/null -H "Title: Audelin" \
        -d "code_review hit model capacity; switched to one reviewer at a time and rerunning" \
        "https://ntfy.sh/$(cat "$topic")"
fi
mv "$out" "$out.capacity"
review
