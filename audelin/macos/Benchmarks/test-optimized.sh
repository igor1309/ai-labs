#!/bin/bash
# test-optimized.sh [SECONDS]: builds and runs the app's tests optimized, bounded.
set -euo pipefail
cd "$(dirname "$0")/.."
swift build --build-tests -Xswiftc -O
sh ../scripts/swift-test-bounded.sh "${1:-180}" -Xswiftc -O
