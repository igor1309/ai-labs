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

# The README's first run must work as written: its second sh block, run
# in a fresh git repository on a copy of home, prints Hello, world with
# no warnings.
echo "== README first run on bash"
first_run=$(mktemp -d)
trap 'rm -rf "$first_run"' EXIT
go build -o "$first_run/agister" ./cmd/agister
cp -R home "$first_run/home"
awk '/^```sh$/ { n++; on = (n == 2); next } /^```$/ { on = 0 } on' README.md > "$first_run/first-run.sh"
cd "$first_run"
git init -q
AGISTER_HOME="$first_run/home" ./agister check > /dev/null
AGISTER_HOME="$first_run/home" sh first-run.sh > result.json 2> progress.txt
# The result is indented JSON: stdout's head is the "head" inside the
# "stdout" object, and the run's warnings are a top-level key.
stdout_head=$(awk '/^ *"stdout": \{/ { in_stdout = 1; next } in_stdout && /^ *\}/ { exit } in_stdout && /^ *"head": / { print; exit }' result.json)
if test "$stdout_head" != '        "head": "Hello, world\n",' || ! grep -q '^  "warnings": \[\]' result.json; then
  echo "the README's first run did not print Hello, world without warnings:"
  cat first-run.sh result.json progress.txt
  exit 1
fi
