#!/bin/sh
# Run in a logged-in macOS session with Accessibility and Screen Recording access.
set -eu
scripts=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
swift build --package-path "$scripts/../App" --product CallsRehearsal
rehearsal="$(swift build --package-path "$scripts/../App" --show-bin-path)/CallsRehearsal"
driver_dir=$(mktemp -d "${TMPDIR:-/tmp}/audelin-live-driver.XXXXXX")
trap 'rm -rf "$driver_dir"' EXIT
swiftc -parse-as-library -module-cache-path "$driver_dir/module-cache" \
    "$scripts/live/calls-summary.swift" -o "$driver_dir/calls-summary"
"$driver_dir/calls-summary" "$rehearsal"
