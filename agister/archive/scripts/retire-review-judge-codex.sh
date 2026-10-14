#!/bin/sh
# Back up and retire home's Codex-specific judge copies before install home.
# Usage: retire-review-judge-codex.sh [home]
set -eu

agister_home=$(cd "${1:-${AGISTER_HOME:-$HOME/.agister}}" && pwd)
cd "$(dirname "$0")/.."
exec go run ./cmd/retire-settings "$agister_home" retire-review-judge-codex workflow:code_review_codex process:review_judge_codex
