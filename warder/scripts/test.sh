#!/bin/sh
# The warder check: format, vet and race tests for every Go module under
# warder/. Each component is its own module, so each is checked alone.
# Quiet: one line per package, details only for failures.
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
mods=$(cd "$root" && find . -name go.mod -not -path '*/testdata/*' | sort)

if [ -z "$mods" ]; then
  echo "warder: no Go modules yet"
  exit 0
fi

for mod in $mods; do
  dir=$(dirname "$mod")
  echo "== warder/${dir#./}"
  (
    cd "$root/$dir"
    unformatted=$(gofmt -l .)
    if [ -n "$unformatted" ]; then
      echo "gofmt needed:"
      echo "$unformatted"
      exit 1
    fi
    go vet ./...
    go test -race -count=1 -timeout 1m ./...
  )
done
