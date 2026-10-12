#!/bin/sh
# Drives one step of a change through the gate: implement, commit, review,
# fix the majors, review again, at most three reviews. main.go says how.
# It is built from this directory and run from the caller's, so its paths
# are the caller's.
#
# Usage: gate.sh --issue <file> --title <line> [--constraints <file>]
#   --implement <workflow> --advisor <workflow> --decisions <file>
#   --base <rev> --message <subject> --out <dir>
#   [--dir <worktree>] [--from implement|review] [--reviews <n>]
set -eu

src=$(cd "$(dirname "$0")" && pwd)
bin=$(mktemp -d)
trap 'rm -rf "$bin"' EXIT
(cd "$src" && go build -o "$bin/agister-gate" .)
"$bin/agister-gate" "$@"
