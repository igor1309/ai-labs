#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
# shellcheck source=../lib/common.sh
. "${script_dir}/../lib/common.sh"

# size_mb <path> — emit size in MB (integer), or 0 if path missing.
size_mb() {
    target=$1
    [ -e "$target" ] || { printf '0'; return; }
    du -sk "$target" 2>/dev/null | awk '{print int($1 / 1024)}' | head -n 1
}

# trash_old_mb — size in MB of ~/.Trash entries with mtime older than 30 days.
trash_old_mb() {
    trash="${HOME}/.Trash"
    [ -d "$trash" ] || { printf '0'; return; }

    total_kb=0
    # POSIX find with -mtime +30 selects items modified >30 days ago.
    while IFS= read -r item; do
        [ -n "$item" ] || continue
        kb=$(du -sk "$item" 2>/dev/null | awk '{print $1}' | head -n 1)
        case "$kb" in ''|*[!0-9]*) kb=0 ;; esac
        total_kb=$(( total_kb + kb ))
    done <<EOF
$(find "$trash" -mindepth 1 -maxdepth 1 -mtime +30 2>/dev/null)
EOF

    printf '%s' $(( total_kb / 1024 ))
}

main() {
    derived_data=$(size_mb "${HOME}/Library/Developer/Xcode/DerivedData")
    simulator_caches=$(size_mb "${HOME}/Library/Developer/CoreSimulator/Caches")
    user_caches=$(size_mb "${HOME}/Library/Caches")
    homebrew_downloads=$(size_mb "${HOME}/Library/Caches/Homebrew/downloads")
    trash_old=$(trash_old_mb)

    ts=$(mh_now_utc)
    line=$(printf '{"ts":"%s","check":"leftovers","status":"ok","sizes":{"derived_data":%s,"simulator_caches":%s,"user_caches":%s,"homebrew_downloads":%s,"trash_old_30d":%s}}' \
        "$ts" "$derived_data" "$simulator_caches" "$user_caches" "$homebrew_downloads" "$trash_old")
    mh_append_line "$line"
}

main "$@"
