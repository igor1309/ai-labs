#!/bin/sh
# The Agister check: gokit's check, which Agister builds against, then
# Agister's own format, vet and race tests. The archive is its own module,
# kept as reference, and is not checked.
set -eu

cd "$(dirname "$0")/.."

../gokit/scripts/test.sh

# Assigned on its own, so that a go list that fails stops the check.
packages=$(go list -f '{{.Dir}}' ./...)
unformatted=$(gofmt -l $packages)
if ! test -z "$unformatted"; then
  echo "gofmt needed:"
  echo "$unformatted"
  exit 1
fi
go vet ./...
go test -race -count=1 -timeout 1m ./...
