#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd -P)"
exec python3 "$HERE/../ios/scripts/lane_run.py" "$@"
