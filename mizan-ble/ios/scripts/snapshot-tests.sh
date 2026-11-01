#!/bin/sh
# Runs the screen snapshots on one pinned simulator, so the references do not
# drift with whatever simulator happens to be installed. SNAPSHOT_RECORD=1
# rewrites the references.
set -eu

NAME="Mizan Snapshots iPhone 15 Pro"
TYPE="com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro"
RUNTIME="com.apple.CoreSimulator.SimRuntime.iOS-26-3"

cd "$(dirname "$0")/.."

udid=$(xcrun simctl list devices -j | python3 -c '
import json, sys
name, runtime = sys.argv[1], sys.argv[2]
devices = json.load(sys.stdin)["devices"].get(runtime, [])
print(next((d["udid"] for d in devices if d["name"] == name and d["isAvailable"]), ""))
' "$NAME" "$RUNTIME")
if [ -z "$udid" ]; then
    udid=$(xcrun simctl create "$NAME" "$TYPE" "$RUNTIME")
fi

result="${RESULT_BUNDLE:-/tmp/mizan-snapshots.xcresult}"
rm -rf "$result"
TEST_RUNNER_SNAPSHOT_RECORD="${SNAPSHOT_RECORD:-0}" xcodebuild test \
    -scheme MizanBLE-Package \
    -destination "platform=iOS Simulator,id=$udid" \
    -only-testing UISnapshotTests \
    -resultBundlePath "$result" \
    -quiet
