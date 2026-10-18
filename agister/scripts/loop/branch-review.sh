#!/usr/bin/env bash
# branch-review.sh: home's code_review on the branch, by the loop's
# Agister (install.sh), against the goal file; its output rendered to
# markdown, and a triage skeleton.
# Writes branch-review-<n>.json, .log, .md and triage-branch-review-<n>.md.
set -euo pipefail
bin=$(cd "$(dirname "$0")" && pwd)
# The branch's directory: $LOOP_DIR, or /tmp/<the current branch>.
dir=${LOOP_DIR:-/tmp/$(git branch --show-current)}
[[ -f $dir/config.sh ]] || { echo "no $dir/config.sh" >&2; exit 2; }
source "$dir/config.sh"
n=$("$bin/next-round.sh" "$dir" branch-review)
out="$dir/branch-review-$n"
echo "round $n at $(git -C "$WT" rev-parse --short HEAD), goal $GOAL"
(cd "$WT" && agister run code_review \
  --param goal="$GOAL") > "$out.json" 2> "$out.log" || true
python3 -I "$bin/render-review.py" "$out.json" "$out.md" "$dir/triage-branch-review-$n.md"
echo "review: $out.md"
echo "triage: $dir/triage-branch-review-$n.md"
