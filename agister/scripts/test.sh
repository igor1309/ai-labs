#!/bin/sh
# The Agister check: gokit's check, which Agister builds against, then
# Agister's own format, vet and race tests. The archive is its own module,
# kept as reference, and is not checked. Each stage says what it ran: the
# files gofmt saw, the packages vet saw, and for each package the tests that
# ran, passed, failed and were skipped (gokit's testreport).
set -eu

cd "$(dirname "$0")/.."

echo "== gokit check: ../gokit/scripts/test.sh"
../gokit/scripts/test.sh

# gofmt is given the module's files, every build's: from a directory it
# would walk into the archive. find passes each path whole, spaces and all,
# and fails when gofmt does.
files=$(find . -path ./archive -prune -o -type f -name '*.go' -print | wc -l | tr -d ' ')
echo "== agister gofmt -l: $files files"
unformatted=$(find . -path ./archive -prune -o -type f -name '*.go' -exec gofmt -l {} +)
if ! test -z "$unformatted"; then
  echo "gofmt needed:"
  echo "$unformatted"
  exit 1
fi

packages=$(go list ./... | wc -l | tr -d ' ')
echo "== agister go vet ./...: $packages packages"
go vet ./...

# go test's events go to a file, so its exit status is kept: a POSIX pipe
# would give testreport's alone.
echo "== agister go test -race -count=1 -timeout 1m ./..."
events=$(mktemp)
trap 'rm -f "$events"' EXIT
status=0
go test -race -count=1 -timeout 1m -json ./... >"$events" || status=$?
go run github.com/igor1309/ai-labs/gokit/cmd/testreport <"$events" || status=1
exit "$status"
