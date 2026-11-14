#!/bin/sh
# Builds a live driver into one signed app at a fixed path and runs it through
# LaunchServices. macOS then checks Accessibility and Screen Recording against
# that app, not against whatever started this script (a terminal, or the CI
# runner's bundled Node, whose path moves with every runner update). Grant the
# app both permissions once; the grant holds across rebuilds because the
# bundle identifier and signing identity stay the same.
#
# Usage: run-driver.sh <driver.swift> <driver arguments...>
# AUDELIN_LIVE_DRIVER_APP overrides where the app lives;
# AUDELIN_LIVE_SIGNING_IDENTITY names the codesign identity.
set -eu
[ $# -ge 1 ] || { echo "Usage: run-driver.sh <driver.swift> <driver arguments...>" >&2; exit 2; }
source=$1
shift
app=${AUDELIN_LIVE_DRIVER_APP:-"$HOME/Library/Application Support/Audelin/AudelinLiveDriver.app"}
identity=${AUDELIN_LIVE_SIGNING_IDENTITY:-"Apple Development: Igor Malyarov"}

work=$(mktemp -d "${TMPDIR:-/tmp}/audelin-live-driver.XXXXXX")
trap 'rm -rf "$work"' EXIT
swiftc -parse-as-library -module-cache-path "$work/module-cache" "$source" -o "$work/driver"

mkdir -p "$app/Contents/MacOS"
cp "$work/driver" "$app/Contents/MacOS/AudelinLiveDriver"
cat > "$app/Contents/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleIdentifier</key><string>dev.igor1309.audelin.live-driver</string>
    <key>CFBundleName</key><string>AudelinLiveDriver</string>
    <key>CFBundleExecutable</key><string>AudelinLiveDriver</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>LSUIElement</key><true/>
</dict>
</plist>
EOF
codesign --force --sign "$identity" "$app"

# open does not return the driver's exit status; every driver prints a line
# starting with "PASS:" when, and only when, its scenario passed.
: > "$work/stdout"
: > "$work/stderr"
status=0
open -W -n -g --stdout "$work/stdout" --stderr "$work/stderr" "$app" --args "$@" || status=$?
cat "$work/stdout"
cat "$work/stderr" >&2
[ "$status" -eq 0 ] || { echo "FAIL: open exited $status for $app" >&2; exit 1; }
grep -q '^PASS:' "$work/stdout" || {
    echo "FAIL: the driver did not pass. If it reports missing access, grant $app Accessibility and Screen Recording." >&2
    exit 1
}
