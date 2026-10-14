#!/bin/sh
# Retires home's processes implement_codex, implement_pi and
# implement_pi_glm, so home's settings folder installs over a home that
# holds them: cmd/retire-implement-processes says how. It backs them up
# as an install backup, through the installer's own manifest and digest
# checks, before it removes any; `agister install --restore <stamp>`
# puts them back.
#
# Usage: retire-implement-processes.sh [home]
# home is $AGISTER_HOME when not given, else ~/.agister, as for agister.
set -eu

home=$(cd "${1:-${AGISTER_HOME:-$HOME/.agister}}" && pwd)
cd "$(dirname "$0")/.."
exec go run ./cmd/retire-implement-processes "$home"
