#!/bin/bash
#
# Find the most recent .app bundle matching a bundle identifier in DerivedData
#
# Usage: find_app.sh <bundle_identifier>
#
# Output: Path to the most recent matching .app bundle (iOS Simulator build)
#

set -e

BUNDLE_ID="$1"

if [ -z "$BUNDLE_ID" ]; then
echo "Usage: find_app.sh <bundle_identifier>"
exit 1
fi

# Get DerivedData path from Xcode preferences (defaults to standard location)

DERIVED_DATA=$(defaults read com.apple.dt.Xcode IDECustomDerivedDataLocation 2>/dev/null || echo "$HOME/Library/Developer/Xcode/DerivedData")

if [ ! -d "$DERIVED_DATA" ]; then
echo "Error: DerivedData directory not found at $DERIVED_DATA"
exit 1
fi

# Find all .app bundles for iOS Simulator (in iphonesimulator* directories)
# that match the bundle identifier, sorted by modification time (newest first)

FOUND_APP=$(
find "$DERIVED_DATA" -path "*/Build/Products/*iphonesimulator*/*.app" -type d 2>/dev/null | while read -r app; do
if [ -f "$app/Info.plist" ]; then
app_bundle_id=$(defaults read "$app/Info.plist" CFBundleIdentifier 2>/dev/null || true)
if [ "$app_bundle_id" = "$BUNDLE_ID" ]; then
# Print modification time and path
stat -f "%m|%N" "$app"
fi
fi
done | sort -rn | head -1 | cut -d'|' -f2-
)

if [ -z "$FOUND_APP" ]; then
echo "Error: No app found with bundle identifier '$BUNDLE_ID' in $DERIVED_DATA"
exit 1
fi

echo "$FOUND_APP"
