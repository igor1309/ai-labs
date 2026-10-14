#!/bin/sh
# The gokit check: format, vet and race tests. Each stage says what it ran:
# the files gofmt saw, the packages vet saw, and for each package the tests
# that ran, passed, failed and were skipped (testreport). Failures come in
# full.
set -eu

cd "$(dirname "$0")/.."

files=$(find . -type f -name '*.go' | wc -l | tr -d ' ')
echo "== gokit gofmt -l: $files files"
unformatted=$(gofmt -l .)
if ! test -z "$unformatted"; then
  echo "gofmt needed:"
  echo "$unformatted"
  exit 1
fi

packages=$(go list ./... | wc -l | tr -d ' ')
echo "== gokit go vet ./...: $packages packages"
go vet ./...

# go test's events go to a file, so its exit status is kept: a POSIX pipe
# would give testreport's alone.
echo "== gokit go test -race -count=1 -timeout 1m ./..."
events=$(mktemp)
trap 'rm -f "$events"' EXIT
status=0
go test -race -count=1 -timeout 1m -json ./... >"$events" || status=$?
go run ./cmd/testreport <"$events" || status=1
exit "$status"
