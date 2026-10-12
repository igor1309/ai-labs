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
# Each package's tests get 1m, but cmd/agister's, which run the binary and
# near two minutes on a busy runner, get 3m until LAB-222 makes them fast.
# A -coverprofile is written per call and joined.
gotest() {
  timeout=$1 suffix=$2 packages=$3
  shift 3
  for arg; do
    shift
    case $arg in -coverprofile=*) arg=$arg$suffix ;; esac
    set -- "$@" "$arg"
  done
  go test -race -count=1 -timeout "$timeout" "$@" $packages
}
gotest 1m "" "$(go list ./... | grep -v '/cmd/agister$')" "$@"
gotest 3m .cmd ./cmd/agister "$@"
for arg; do
  case $arg in -coverprofile=*)
    profile=${arg#-coverprofile=}
    tail -n +2 "$profile.cmd" >>"$profile"
    rm "$profile.cmd"
    ;;
  esac
done
if ! pages=$(node --test pages/tests/*.test.js 2>&1); then
  echo "$pages"
  exit 1
fi
../gokit/scripts/test.sh
