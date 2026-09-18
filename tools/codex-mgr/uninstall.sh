#!/bin/sh
set -eu

# Uninstall codex-mgr: remove the symlink created by install.sh, but only if it
# points at this tool's script.
#
# Env override:
#   CODEX_MGR_BIN_DIR   directory holding the symlink (default ~/.local/bin)

tool_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
script_path="$tool_dir/codex-mgr.sh"
bin_dir=${CODEX_MGR_BIN_DIR:-"$HOME/.local/bin"}
link_path="$bin_dir/codex-mgr"

case "${1:-}" in
    '') ;;
    -h | --help)
        printf 'Usage: %s\n' "$0"
        printf '  removes %s if it links to codex-mgr.sh\n' "$link_path"
        printf '  (directory: CODEX_MGR_BIN_DIR, default ~/.local/bin)\n'
        exit 0
        ;;
    *)
        printf 'Usage: %s\n' "$0" >&2
        exit 2
        ;;
esac

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
