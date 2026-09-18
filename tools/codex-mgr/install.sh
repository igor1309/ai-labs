#!/bin/sh
set -eu

# Install codex-mgr: symlink the script into a PATH directory so `codex-mgr`
# is invokable from any shell.
#
# Env override:
#   CODEX_MGR_BIN_DIR   target directory for the symlink (default ~/.local/bin)

tool_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
script_path="$tool_dir/codex-mgr.sh"
bin_dir=${CODEX_MGR_BIN_DIR:-"$HOME/.local/bin"}
link_path="$bin_dir/codex-mgr"

case "${1:-}" in
    '') ;;
    -h | --help)
        printf 'Usage: %s\n' "$0"
        printf '  symlinks codex-mgr.sh to %s\n' "$link_path"
        printf '  (directory: CODEX_MGR_BIN_DIR, default ~/.local/bin)\n'
        exit 0
        ;;
    *)
        printf 'Usage: %s\n' "$0" >&2
        exit 2
        ;;
esac

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
