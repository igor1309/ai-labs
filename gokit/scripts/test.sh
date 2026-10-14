#!/bin/sh
# The gokit check: format, vet and race tests, for gokit and for tree, a
# module of its own inside it. Each stage says what it ran: the files gofmt
# saw, the packages vet saw, and for each package the tests that ran,
# passed, failed and were skipped (testreport). Failures come in full.
set -eu

cd "$(dirname "$0")/.."
gokit=$(pwd)

events=$(mktemp)
trap 'rm -f "$events"' EXIT

# check runs the check of the module in directory $1, each stage headed
# "== $2". A module inside it has a check of its own, so its files are
# left out of gofmt here, as go's ./... leaves out its packages.
check() {
  cd "$gokit/$1"
  files=$(find . -type d ! -path . -exec test -e {}/go.mod \; -prune -o -type f -name '*.go' -print)
  echo "== $2 gofmt -l: $(echo "$files" | wc -l | tr -d ' ') files"
  unformatted=$(echo "$files" | xargs gofmt -l)
  if ! test -z "$unformatted"; then
    echo "gofmt needed:"
    echo "$unformatted"
    exit 1
  fi

  packages=$(go list ./... | wc -l | tr -d ' ')
  echo "== $2 go vet ./...: $packages packages"
  go vet ./...

  # go test's events go to a file, so its exit status is kept: a POSIX
  # pipe would give testreport's alone.
  echo "== $2 go test -race -count=1 -timeout 1m ./..."
  tested=0
  go test -race -count=1 -timeout 1m -json ./... >"$events" || tested=$?
  go -C "$gokit" run ./cmd/testreport <"$events" || tested=1
  if test "$tested" -ne 0; then
    status=1
  fi
}

status=0
check . gokit
check tree gokit/tree
exit "$status"
