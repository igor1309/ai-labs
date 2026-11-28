#!/bin/sh
# Run in a logged-in macOS session. The driver runs as the app live/run-driver.sh
# builds, which needs Accessibility and Screen Recording access.
set -eu
scripts=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# The public binary download can prompt for Keychain access in unattended runs.
swift build --disable-keychain --package-path "$scripts/../App" --product CallsRehearsal
rehearsal="$(swift build --package-path "$scripts/../App" --show-bin-path)/CallsRehearsal"
"$scripts/live/run-driver.sh" "$scripts/live/calls-merge.swift" "$rehearsal"
