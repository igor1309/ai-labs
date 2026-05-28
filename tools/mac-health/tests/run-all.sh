#!/bin/sh
set -eu

test_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)

overall_failed=0
overall_count=0

for f in "$test_dir"/test-*.sh; do
    [ -f "$f" ] || continue
    sh "$f" || overall_failed=$(( overall_failed + 1 ))
    overall_count=$(( overall_count + 1 ))
done

printf '\n'
if [ "$overall_failed" -eq 0 ]; then
    printf 'mac-health tests: all %s test files passed\n' "$overall_count"
    exit 0
fi
printf 'mac-health tests: %s of %s test files FAILED\n' "$overall_failed" "$overall_count" >&2
exit 1
