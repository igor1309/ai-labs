#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
# shellcheck source=../lib/common.sh
. "${script_dir}/../lib/common.sh"

# Choose the volume to query. On Catalina+ (APFS split system / data layout),
# `/` is the read-only system snapshot and reports a misleading capacity
# relative to a per-volume baseline. The writable data volume at
# `/System/Volumes/Data` gives the user-meaningful free %. Fall back to `/`
# on older macOS where the data volume does not exist.
disk_target() {
    if [ -d /System/Volumes/Data ]; then
        printf '/System/Volumes/Data'
    else
        printf '/'
    fi
}

read_disk() {
    df -k "$(disk_target)" 2>/dev/null | awk 'NR == 2 { gsub("%", "", $5); print $4, $5 }' | head -n 1
}

derive_status() {
    free_pct=$1

    if [ "$free_pct" -ge 15 ]; then
        printf 'ok'
    elif [ "$free_pct" -ge 5 ]; then
        printf 'warn'
    else
        printf 'critical'
    fi
}

main() {
    read_result=$(read_disk)
    free_kb=$(printf '%s' "$read_result" | awk '{print $1}')
    capacity_pct=$(printf '%s' "$read_result" | awk '{print $2}')

    case "$free_kb" in ''|*[!0-9]*) free_kb=0 ;; esac
    case "$capacity_pct" in ''|*[!0-9]*) capacity_pct=100 ;; esac

    free_gb=$(( free_kb / 1024 / 1024 ))
    free_pct=$(( 100 - capacity_pct ))

    status=$(derive_status "$free_pct")
    prev_status=$(mh_prev_field disk status)
    [ -n "$prev_status" ] || prev_status=ok

    ts=$(mh_now_utc)
    line=$(printf '{"ts":"%s","check":"disk","status":"%s","free_gb":%s,"free_pct":%s}' \
        "$ts" "$status" "$free_gb" "$free_pct")
    mh_append_line "$line"

    # Notify on threshold-crossing transitions:
    #   ok -> warn, ok -> critical, warn -> critical.
    notify=no
    case "${prev_status}|${status}" in
        ok\|warn|ok\|critical) notify=yes ;;
        warn\|critical)        notify=yes ;;
    esac

    if [ "$notify" = yes ]; then
        case "$status" in
            warn)     title="mac-health: disk low" ;;
            critical) title="mac-health: disk critical" ;;
            *)        title="mac-health: disk" ;;
        esac
        mh_notify "$title" "free_gb=${free_gb}, free_pct=${free_pct}"
    fi
}

main "$@"
