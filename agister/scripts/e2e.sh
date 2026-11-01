#!/bin/sh
# The end-to-end check (docs/run-implementation.md, "A step on a model
# runtime", "Continuation" and "Recovery"): the built agister runs a step
# on real claude-code and codex, continues it, and recovers a stale turn,
# on the owner's logins, for a few cents. Opt-in: its tests run only with
# AGISTER_E2E=1, and are skipped otherwise, saying so. Each stage says what
# it ran, as scripts/test.sh does (gokit's testreport).
set -eu

cd "$(dirname "$0")/.."

if test "${AGISTER_E2E:-}" != 1; then
  echo "== agister e2e: AGISTER_E2E is not 1, so its tests skip"
fi

# go test's events go to a file, so its exit status is kept: a POSIX pipe
# would give testreport's alone.
echo "== agister e2e: go test -count=1 -timeout 2m ./e2e/"
events=$(mktemp)
trap 'rm -f "$events"' EXIT
status=0
go test -count=1 -timeout 2m -json ./e2e/ >"$events" || status=$?
go run github.com/igor1309/ai-labs/gokit/cmd/testreport <"$events" || status=1
exit "$status"
