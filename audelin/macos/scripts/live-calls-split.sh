#!/bin/sh
# Run in a logged-in macOS session with Accessibility and Screen Recording.
set -eu
scripts=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ -n "${AUDELIN_CALLS_REHEARSAL:-}" ]; then
    rehearsal=$AUDELIN_CALLS_REHEARSAL
else
    # The public binary download can prompt for Keychain access in unattended runs.
    swift build --disable-keychain --package-path "$scripts/../App" --product CallsRehearsal
    rehearsal="$(swift build --package-path "$scripts/../App" --show-bin-path)/CallsRehearsal"
fi
"$scripts/live/run-driver.sh" --support "$scripts/live/calls-driver.swift" "$scripts/live/calls-split.swift" "$rehearsal"
