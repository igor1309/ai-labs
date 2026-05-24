#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
# shellcheck source=../lib/common.sh
. "${script_dir}/../lib/common.sh"

read_pressure() {
    memory_pressure 2>/dev/null \
        | sed -n 's/^System-wide memory pressure level:[[:space:]]*\([a-zA-Z]*\).*/\1/p' \
        | tr '[:upper:]' '[:lower:]' \
        | head -n 1
}

read_swap_used_mb() {
    sysctl vm.swapusage 2>/dev/null \
        | sed -n 's/.*used = \([0-9]*\)\.[0-9]*M.*/\1/p' \
        | head -n 1
}

# Determine if swap is trending up across the last 6 memory-check entries
# (including the current one passed as the first arg, since the current entry
# is not yet in the log when we evaluate).
swap_trending_up() {
    current=$1

    prior_nums=$(mh_last_n_field_nums memory swap_used_mb 5)
    if [ -z "$prior_nums" ]; then
        return 1
    fi

    samples=$(printf '%s\n%s\n' "$prior_nums" "$current")
    count=$(printf '%s\n' "$samples" | grep -c '^[0-9]')
    [ "$count" -ge 6 ] || return 1

    printf '%s\n' "$samples" | awk -v current="$current" '
        BEGIN { prev = -1; first = -1 }
        NF {
            if (first < 0) { first = $1 }
            if (prev >= 0 && $1 < prev) { exit 1 }
            prev = $1
        }
        END {
            if (current <= first) { exit 1 }
            if (current <= 1024) { exit 1 }
            exit 0
        }
    '
}

derive_status() {
    pressure=$1
    trending=$2

    case "$pressure" in
        normal)   printf 'ok' ;;
        warn)     printf 'warn' ;;
        critical)
            if [ "$trending" = yes ]; then
                printf 'critical'
            else
                printf 'warn'
            fi
            ;;
        *)        printf 'ok' ;;
    esac
}

main() {
    pressure=$(read_pressure)
    [ -n "$pressure" ] || pressure=normal

    swap_used_mb=$(read_swap_used_mb)
    case "$swap_used_mb" in
        ''|*[!0-9]*) swap_used_mb=0 ;;
    esac

    if swap_trending_up "$swap_used_mb"; then
        trending=yes
    else
        trending=no
    fi

    status=$(derive_status "$pressure" "$trending")
    prev_status=$(mh_prev_field memory status)
    [ -n "$prev_status" ] || prev_status=ok

    ts=$(mh_now_utc)
    line=$(printf '{"ts":"%s","check":"memory","status":"%s","pressure":"%s","swap_used_mb":%s}' \
        "$ts" "$status" "$pressure" "$swap_used_mb")
    mh_append_line "$line"

    if [ "$status" = critical ] && [ "$prev_status" != critical ]; then
        mh_notify "mac-health: memory pressure critical" \
            "pressure=${pressure}, swap_used_mb=${swap_used_mb}"
    fi
}

main "$@"
