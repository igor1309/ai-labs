#!/bin/bash
# Builds the profiling harness, optimized, against this checkout. Outside the agent sandbox.
case "${1:-}" in -h|--help) sed -n '2,/^[^#]/s/^# \{0,1\}//p' "$0"; exit 0;; esac
set -euo pipefail
cd "$(dirname "$0")"
swift build -c release --disable-sandbox
