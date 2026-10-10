#!/bin/sh
# The Agister check: format, vet, race tests and the Pages tests, then
# gokit's check, since Agister builds against ../gokit. Arguments go to
# go test (CI passes its coverage flags). Quiet: one line per package,
# details only for failures.
set -eu

cd "$(dirname "$0")/.."

unformatted=$(gofmt -l .)
if ! test -z "$unformatted"; then
  echo "gofmt needed:"
  echo "$unformatted"
  exit 1
fi
go vet ./...
go test -race -count=1 -timeout 1m "$@" ./...
if ! pages=$(node --test pages/tests/*.test.js 2>&1); then
  echo "$pages"
  exit 1
fi
../gokit/scripts/test.sh
