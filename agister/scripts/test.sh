#!/bin/sh
# The Agister check: gokit's check, which Agister builds against, then
# Agister's own format, vet and race tests. The archive is its own module,
# kept as reference, and is not checked.
set -eu

cd "$(dirname "$0")/.."

../gokit/scripts/test.sh

# gofmt is given the module's files, every build's: from a directory it
# would walk into the archive. find passes each path whole, spaces and all,
# and fails when gofmt does.
unformatted=$(find . -path ./archive -prune -o -type f -name '*.go' -exec gofmt -l {} +)
if ! test -z "$unformatted"; then
  echo "gofmt needed:"
  echo "$unformatted"
  exit 1
fi
go vet ./...
go test -race -count=1 -timeout 1m ./...
