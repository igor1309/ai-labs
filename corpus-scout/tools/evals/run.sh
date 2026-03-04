#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(dirname "$(readlink -f "$0")")"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"

exec node "$SCRIPT_DIR/run.js"
