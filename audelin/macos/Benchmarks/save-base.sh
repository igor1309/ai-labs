#!/bin/bash
# save-base.sh [benchmark options]: saves this code as the new base. Commit the result.
case "${1:-}" in -h|--help) sed -n '2,/^[^#]/s/^# \{0,1\}//p' "$0"; exit 0;; esac
set -euo pipefail
cd "$(dirname "$0")"
swift package --disable-sandbox --allow-writing-to-package-directory benchmark baseline update base "$@"
