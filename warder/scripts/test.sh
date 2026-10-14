#!/bin/sh
# The warder check: format, vet and race tests for the warder module,
# its architecture test included. Quiet: one line per package, details
# only for failures.
set -eu

cd "$(dirname "$0")/.."

unformatted=$(gofmt -l .)
if ! test -z "$unformatted"; then
  echo "gofmt needed:"
  echo "$unformatted"
  exit 1
fi
go vet ./...
go test -race -count=1 -timeout 1m ./...
