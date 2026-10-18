#!/usr/bin/env bash
# implement.sh <brief> [agent]: home's implement on the branch, by the
# loop's Agister (install.sh), on agent, claude-opus by default; the
# brief's path absolute. Writes implement-<n>.json and .log.
set -euo pipefail
bin=$(cd "$(dirname "$0")" && pwd)
# The branch's directory: $LOOP_DIR, or /tmp/<the current branch>.
dir=${LOOP_DIR:-/tmp/$(git branch --show-current)}
[[ -f $dir/config.sh ]] || { echo "no $dir/config.sh" >&2; exit 2; }
source "$dir/config.sh"
(( $# >= 1 )) || { echo "usage: implement.sh <brief> [agent]" >&2; exit 2; }
n=$("$bin/next-round.sh" "$dir" implement)
out="$dir/implement-$n"
echo "round $n at $(git -C "$WT" rev-parse --short HEAD), brief $1"
status=0
(cd "$WT" && agister run --process implement \
  --agent "${2:-claude-opus}" --param brief="$1" --dir "$TEST_DIR") > "$out.json" 2> "$out.log" || status=$?
echo "result: $out.json"
exit "$status"
