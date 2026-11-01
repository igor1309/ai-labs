#!/bin/bash
# test-optimized.sh [SECONDS]: builds and runs the app's tests optimized, bounded.
case "${1:-}" in -h|--help) sed -n '2,/^[^#]/s/^# \{0,1\}//p' "$0"; exit 0;; esac
set -euo pipefail
cd "$(dirname "$0")/../App"
swift build --build-tests -Xswiftc -O
sh ../../scripts/swift-test-bounded.sh "${1:-180}" -Xswiftc -O
