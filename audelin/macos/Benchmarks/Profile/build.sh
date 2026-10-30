#!/bin/bash
# Builds the profiling harness, optimized, against this checkout. Outside the agent sandbox.
set -euo pipefail
cd "$(dirname "$0")"
swift build -c release --disable-sandbox
