#!/bin/sh
set -eu

# Uninstall cl: remove the symlink created by install.sh, but only if it points
# at this tool's script.
#
# Env override:
#   CL_BIN_DIR   directory holding the symlink (default ~/.local/bin)

tool_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
script_path="$tool_dir/cl.sh"
bin_dir=${CL_BIN_DIR:-"$HOME/.local/bin"}
link_path="$bin_dir/cl"

if [ -L "$link_path" ]; then
    target=$(readlink "$link_path")
    if [ "$target" = "$script_path" ]; then
        rm -f "$link_path"
        printf 'Removed %s\n' "$link_path"
        exit 0
    fi
    printf 'Skipped: %s points to %s, not %s\n' "$link_path" "$target" "$script_path" >&2
    exit 1
fi

printf 'Nothing to remove: %s is not a symlink\n' "$link_path"
