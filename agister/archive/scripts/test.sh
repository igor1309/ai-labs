#!/bin/sh
# The Agister check: format, vet, race tests and the Pages tests, then
# gokit's check, since Agister builds against ../gokit. Arguments go to
# go test (CI passes its coverage flags). Quiet: one line per package,
# details only for failures, and a line for each package over 60s.
set -eu

cd "$(dirname "$0")/.."

unformatted=$(gofmt -l .)
if ! test -z "$unformatted"; then
  echo "gofmt needed:"
  echo "$unformatted"
  exit 1
fi
go vet ./...
# A package that takes over half the timeout is named, still passing.
tests=$(mktemp)
status=$(mktemp)
{ go test -race -count=1 -timeout 2m "$@" ./... || echo failed >"$status"; } | tee "$tests"
scripts/slow-packages.sh 60 <"$tests"
if test -s "$status"; then
  rm -f "$tests" "$status"
  exit 1
fi
rm -f "$tests" "$status"
if ! pages=$(node --test pages/tests/*.test.js 2>&1); then
  echo "$pages"
  exit 1
fi
../gokit/scripts/test.sh
