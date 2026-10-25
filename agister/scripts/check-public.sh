#!/bin/sh
# The public snapshot keeps its dependencies beneath the module. The
# workspace overrides go.mod's sibling paths without changing that file.
set -eu

cd "$(dirname "$0")/.."
export GOWORK="$PWD/go.work"

# gokit and tree have their own module checks and local replacements.
GOWORK=off sh gokit/scripts/test.sh

echo "== agister gofmt -l"
unformatted=$(find . -type d ! -path . -exec test -e {}/go.mod \; -prune -o -type f -name '*.go' -exec gofmt -l {} +)
if ! test -z "$unformatted"; then
  echo "gofmt needed:"
  echo "$unformatted"
  exit 1
fi

echo "== agister size limits: features 100 lines, tests 1000"
too_big=$(find . -type d ! -path . -exec test -e {}/go.mod \; -prune -o -type f \( -name '*.feature' -o -name '*_test.go' \) -exec awk '
  function report(limit) {
    limit = (prev ~ /\.feature$/) ? 100 : 1000
    if (n > limit) printf "  %s: %d lines, limit %d\n", prev, n, limit
  }
  FNR == 1 && prev != "" { report() }
  { prev = FILENAME; n = FNR }
  END { if (prev != "") report() }' {} +)
if ! test -z "$too_big"; then
  echo "over the size limit:"
  echo "$too_big"
  exit 1
fi

echo "== agister go build ./..."
go build ./...
echo "== agister go vet ./..."
go vet ./...
echo "== agister go test -race -count=1 -timeout 1m ./... (e2e skipped)"
env -u AGISTER_E2E go test -race -count=1 -timeout 1m ./...
