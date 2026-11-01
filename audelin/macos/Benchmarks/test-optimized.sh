#!/bin/bash
# test-optimized.sh [SECONDS]: builds and runs both packages' tests optimized, bounded.
case "${1:-}" in -h|--help) sed -n '2,/^[^#]/s/^# \{0,1\}//p' "$0"; exit 0;; esac
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
for package in .. ../App; do
  cd "$here/$package"
  swift build --build-tests -Xswiftc -O
  sh "$here/../../scripts/swift-test-bounded.sh" "${1:-180}" -Xswiftc -O
done
