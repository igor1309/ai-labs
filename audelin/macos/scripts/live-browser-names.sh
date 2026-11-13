#!/bin/sh
# Run in a logged-in macOS session with Accessibility and Screen Recording access.
# Rehearses a one-minute call twice, with and without recorded Telemost
# extension events, and checks the panel and transcript name the remote speakers.
set -eu
scripts=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
swift build --package-path "$scripts/../App" --product AudelinRehearsal
rehearsal="$(swift build --package-path "$scripts/../App" --show-bin-path)/AudelinRehearsal"
driver_dir=$(mktemp -d "${TMPDIR:-/tmp}/audelin-live-driver.XXXXXX")
trap 'rm -rf "$driver_dir"' EXIT
swiftc -parse-as-library -module-cache-path "$driver_dir/module-cache" \
    "$scripts/live/browser-names.swift" -o "$driver_dir/browser-names"
"$driver_dir/browser-names" "$rehearsal" "$scripts/live/fixtures/telemost-two-speakers.json"
