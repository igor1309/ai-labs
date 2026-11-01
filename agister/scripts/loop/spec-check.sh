#!/usr/bin/env bash
# spec-check.sh: the spec's self-check before a review. Aligns the
# features' tables in place, then reports prose too wide, a feature near
# or over the hook's 100 lines, and a backlog file named that is not
# there. Exits 1 on any report; alignment alone is no failure.
set -euo pipefail
bin=$(cd "$(dirname "$0")" && pwd)
# The branch's directory: $LOOP_DIR, or /tmp/<the current branch>.
dir=${LOOP_DIR:-/tmp/$(git branch --show-current)}
[[ -f $dir/config.sh ]] || { echo "no $dir/config.sh" >&2; exit 2; }
source "$dir/config.sh"
cd "$WT"
# shellcheck disable=SC2086
features=$(ls $FEATURES)
for f in $features; do
  before=$(shasum < "$f")
  python3 -I "$bin/align.py" "$f"
  [[ $(shasum < "$f") == "$before" ]] || echo "aligned: $f"
done
python3 -I "$bin/spec-check.py" "$TEST_DIR" "$NOTES" $features
