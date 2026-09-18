#!/bin/sh
set -eu

# Install cl: symlink the script into a PATH directory so `cl` is invokable
# from any shell.
#
# Env override:
#   CL_BIN_DIR   target directory for the symlink (default ~/.local/bin)

tool_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
script_path="$tool_dir/cl.sh"
bin_dir=${CL_BIN_DIR:-"$HOME/.local/bin"}
link_path="$bin_dir/cl"

if [ ! -f "$script_path" ]; then
    printf 'ERROR: %s not found\n' "$script_path" >&2
    exit 1
fi

mkdir -p "$bin_dir"
chmod +x "$script_path"
ln -sf "$script_path" "$link_path"
printf 'Linked %s -> %s\n' "$link_path" "$script_path"

case ":$PATH:" in
    *":$bin_dir:"*)
        ;;
    *)
        printf 'WARNING: %s is not on your PATH; add it to your shell profile.\n' "$bin_dir" >&2
        printf '  export PATH="%s:$PATH"\n' "$bin_dir" >&2
        ;;
esac
