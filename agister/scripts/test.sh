#!/bin/sh
# The Agister check: gokit's check, which Agister builds against, then
# Agister's own format, vet and race tests. The archive is its own module,
# kept as reference, and is not checked.
set -eu

cd "$(dirname "$0")/.."

../gokit/scripts/test.sh

# Each Go file of the module's packages, one a line, build constraints or
# not. gofmt is given files, not directories: from a directory it walks into
# any module beneath it, the archive's included. Assigned on its own, so
# that a go list that fails stops the check.
file='{{$.Dir}}/{{.}}{{"\n"}}{{end}}'
files=$(go list -f "{{range .GoFiles}}$file{{range .CgoFiles}}$file{{range .TestGoFiles}}$file{{range .XTestGoFiles}}$file{{range .IgnoredGoFiles}}$file" ./...)
# Each line is one argument, whatever spaces it holds; go list ends each
# package with an empty line.
set --
while IFS= read -r file; do
  if test -n "$file"; then
    set -- "$@" "$file"
  fi
done <<EOF
$files
EOF
unformatted=$(gofmt -l "$@")
if ! test -z "$unformatted"; then
  echo "gofmt needed:"
  echo "$unformatted"
  exit 1
fi
go vet ./...
go test -race -count=1 -timeout 1m ./...
