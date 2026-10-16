#!/usr/bin/env bash
# commit.sh <message> <file>...: runs the tests, then stages the files by
# name and commits them, only if the tests pass. Files are relative to
# the worktree. The full test output is in test-last.log.
set -euo pipefail
bin=$(cd "$(dirname "$0")" && pwd)
# The branch's directory: $LOOP_DIR, or /tmp/<the current branch>.
dir=${LOOP_DIR:-/tmp/$(git branch --show-current)}
[[ -f $dir/config.sh ]] || { echo "no $dir/config.sh" >&2; exit 2; }
source "$dir/config.sh"
(( $# >= 2 )) || { echo "usage: commit.sh <message> <file>..." >&2; exit 2; }
message=$1; shift
cd "$WT"
for f in "$@"; do
  [[ -e $f ]] || git ls-files --error-unmatch "$f" > /dev/null 2>&1 \
    || [[ -n $(git diff --cached --name-only -- "$f") ]] || { echo "no such file: $f" >&2; exit 2; }
done
if ! (cd "$TEST_DIR" && ./scripts/test.sh) > "$dir/test-last.log" 2>&1; then
  tail -20 "$dir/test-last.log"
  echo "tests failed: nothing committed; $dir/test-last.log" >&2
  exit 1
fi
tail -1 "$dir/test-last.log"
git add -- "$@"
git commit -q -m "$message"
git log --oneline -1
