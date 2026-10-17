#!/usr/bin/env bash
# install.sh: the loop's Agister, built from this checkout: the binary to
# ~/.local/bin/agister-next and home's settings, as shipped, to
# ~/.agister-next, which the loop's scripts point AGISTER_HOME at. Run it
# from trunk's checkout after a merge. ~/.agister keeps the archive's.
# ~/.agister-next is this script's copy, replaced whole each time: edit
# agister/home, not it.
set -euo pipefail
src=$(cd "$(dirname "$0")/../.." && pwd)
mkdir -p "$HOME/.local/bin" "$HOME/.agister-next"
(cd "$src" && go build -o "$HOME/.local/bin/agister-next" ./cmd/agister)
rsync -a --delete "$src/home/" "$HOME/.agister-next/"
echo "agister-next at $(git -C "$src" rev-parse --short HEAD)"
