#!/bin/bash
# save-base.sh [benchmark options]: saves this code as the new base. Commit the result.
set -euo pipefail
cd "$(dirname "$0")"
swift package --disable-sandbox --allow-writing-to-package-directory benchmark baseline update base "$@"
