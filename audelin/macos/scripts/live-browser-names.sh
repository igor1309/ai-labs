#!/bin/sh
# Run in a logged-in macOS session. The driver runs as the app live/run-driver.sh
# builds, which needs Accessibility and Screen Recording access.
# Rehearses a one-minute call twice, with and without recorded Telemost
# extension events, and checks the panel and transcript name the remote speakers.
set -eu
scripts=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
swift build --package-path "$scripts/../App" --product AudelinRehearsal
rehearsal="$(swift build --package-path "$scripts/../App" --show-bin-path)/AudelinRehearsal"
"$scripts/live/run-driver.sh" "$scripts/live/browser-names.swift" "$rehearsal" "$scripts/live/fixtures/telemost-two-speakers.json"
