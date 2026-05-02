#!/bin/bash
#
# Install and launch an iOS app on simulator
#
# Usage: install_app.sh <app_path> <simulator_uuid> [deep_link]
#
# Arguments:
# app_path       - Path to the .app bundle
# simulator_uuid - UUID of the target simulator
# deep_link      - Optional URL scheme to open after launch
#

set -e

APP_PATH="$1"
SIMULATOR_UUID="$2"
DEEP_LINK="$3"

if [ -z "$APP_PATH" ] || [ -z "$SIMULATOR_UUID" ]; then
echo "Usage: install_app.sh <app_path> <simulator_uuid> [deep_link]"
exit 1
fi

if [ ! -d "$APP_PATH" ]; then
echo "Error: App bundle not found at $APP_PATH"
exit 1
fi

echo "==> Booting simulator $SIMULATOR_UUID (if not already booted)..."
xcrun simctl boot "$SIMULATOR_UUID" 2>/dev/null || true

echo "==> Installing $APP_PATH..."
xcrun simctl install "$SIMULATOR_UUID" "$APP_PATH"

# Extract bundle identifier from the app
BUNDLE_ID=$(defaults read "$APP_PATH/Info.plist" CFBundleIdentifier)
echo "==> Launching $BUNDLE_ID..."

if [ -n "$DEEP_LINK" ]; then
echo "==> Opening deep link: $DEEP_LINK"
xcrun simctl openurl "$SIMULATOR_UUID" "$DEEP_LINK"
else
xcrun simctl launch "$SIMULATOR_UUID" "$BUNDLE_ID"
fi

echo "==> Done"
