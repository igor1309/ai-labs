#!/bin/sh
# Reviews a step's branch the way the loop needs it: merges origin/trunk
# first, so the review never reports trunk's newer work as removed (it did
# three times on 2026-10-27), then runs Agister's code_review against it.
#
#   review-step.sh <goal.md> <output file>
#
# Run from the step's worktree. Stops if the worktree has uncommitted work
# or the merge conflicts.
#
# If a reviewer hit model capacity or a rate limit, home's code_review is
# switched to one reviewer at a time, the owner is told through ntfy (when
# ~/.config/ntfy/topic exists), and the review runs once more (LAB-686).

goal=$1
out=$2
[ -f "$goal" ] && [ -n "$out" ] || { echo "usage: review-step.sh <goal.md> <output file>" >&2; exit 2; }
[ -z "$(git status --porcelain)" ] || { echo "STOP: uncommitted work" >&2; exit 1; }
git fetch -q origin && git merge -q --no-edit origin/trunk || { echo "STOP: merge of origin/trunk failed" >&2; exit 1; }
review() { agister run code_review --param base=origin/trunk --param candidate=HEAD --param goal="$goal" > "$out" 2>&1; }
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
