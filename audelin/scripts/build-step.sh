#!/bin/sh
# Runs one builder on a step brief: checks the brief has the parts Agister's
# goal form needs, adds brief-rules.md's bullets to its Done when, and runs
# implement_tested through agister-retry.sh.
#
#   build-step.sh <brief.md> <output dir>
#
# Run from the step's worktree. Prints agister-retry's DONE/RETRY/STOP lines.

brief=$1
out=$2
[ -f "$brief" ] && [ -n "$out" ] || { echo "usage: build-step.sh <brief.md> <output dir>" >&2; exit 2; }
for part in '## Intent' '## Done when' '## Out of scope' '## Open'; do
  grep -q "^$part" "$brief" || { echo "STOP: brief lacks \"$part\"" >&2; exit 2; }
done
here=$(cd "$(dirname "$0")" && pwd)
# Agister resolves a relative path against the run's directory, not this
# shell's, so a retry after a rate limit could not find the brief.
mkdir -p "$out" && out=$(cd "$out" && pwd) || exit 2
full="$out/brief.md"
awk -v rules="$here/brief-rules.md" '
  { print }
  /^## Done when/ { while ((getline line < rules) > 0) print line }
' "$brief" > "$full"
exec "$here/agister-retry.sh" -o "$out" -- implement_tested --param brief="$full" --dir audelin
