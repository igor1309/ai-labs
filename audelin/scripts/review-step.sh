#!/bin/sh
# Reviews a step's branch the way the loop needs it: merges origin/trunk
# first, so the review never reports trunk's newer work as removed (it did
# three times on 2026-10-27), then runs Agister's code_review against it.
#
#   review-step.sh <goal.md> <output file>
#
# Run from the step's worktree. Stops if the worktree has uncommitted work
# or the merge conflicts.

goal=$1
out=$2
[ -f "$goal" ] && [ -n "$out" ] || { echo "usage: review-step.sh <goal.md> <output file>" >&2; exit 2; }
[ -z "$(git status --porcelain)" ] || { echo "STOP: uncommitted work" >&2; exit 1; }
git fetch -q origin && git merge -q --no-edit origin/trunk || { echo "STOP: merge of origin/trunk failed" >&2; exit 1; }
agister run code_review --param base=origin/trunk --param candidate=HEAD --param goal="$goal" > "$out" 2>&1
