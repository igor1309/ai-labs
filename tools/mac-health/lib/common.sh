#!/bin/sh
# Shared helpers for mac-health checks.
# All functions assume POSIX sh and are safe under `set -eu`.

mh_default_log_file() {
    printf '%s' "${HOME}/Library/Logs/mac-health/health.log"
}

mh_log_file() {
    if [ -n "${MAC_HEALTH_LOG_FILE:-}" ]; then
        printf '%s' "$MAC_HEALTH_LOG_FILE"
        return
    fi
    mh_default_log_file
}

mh_ensure_log_dir() {
    log_file=$(mh_log_file)
    log_dir=$(dirname "$log_file")
    [ -d "$log_dir" ] || mkdir -p "$log_dir"
}

mh_now_utc() {
    date -u +%Y-%m-%dT%H:%M:%SZ
}

# Append a single line to the log file.
mh_append_line() {
    line=$1
    mh_ensure_log_dir
    printf '%s\n' "$line" >>"$(mh_log_file)"
}

# Extract the most recent JSON value for a given key from log entries matching
# `check=<check_name>`. Returns empty string if no matching entry exists.
# Usage: mh_prev_field <check_name> <field_name>
mh_prev_field() {
    check_name=$1
    field_name=$2
    log_file=$(mh_log_file)
    [ -f "$log_file" ] || return 0

    grep "\"check\":\"${check_name}\"" "$log_file" 2>/dev/null \
        | tail -n 1 \
        | sed -n "s/.*\"${field_name}\":\"\\([^\"]*\\)\".*/\\1/p"
}

# Like mh_prev_field but for numeric values (no quotes around value).
mh_prev_field_num() {
    check_name=$1
    field_name=$2
    log_file=$(mh_log_file)
    [ -f "$log_file" ] || return 0

    grep "\"check\":\"${check_name}\"" "$log_file" 2>/dev/null \
        | tail -n 1 \
        | sed -n "s/.*\"${field_name}\":\\([0-9][0-9]*\\).*/\\1/p"
}

# Return the last N numeric values of a field across check entries (oldest first).
# Usage: mh_last_n_field_nums <check_name> <field_name> <n>
mh_last_n_field_nums() {
    check_name=$1
    field_name=$2
    n=$3
    log_file=$(mh_log_file)
    [ -f "$log_file" ] || return 0

    grep "\"check\":\"${check_name}\"" "$log_file" 2>/dev/null \
        | tail -n "$n" \
        | sed -n "s/.*\"${field_name}\":\\([0-9][0-9]*\\).*/\\1/p"
}

# Fire a notification via terminal-notifier. Best-effort: never propagates failure.
# Clicking "Show" opens the JSONL log so the user can see context. Without the
# `-execute` action, "Show" would default to activating the sender process —
# which is launchd, and which has no UI.
# Usage: mh_notify <title> <message>
mh_notify() {
    title=$1
    message=$2
    if command -v terminal-notifier >/dev/null 2>&1; then
        log_file=$(mh_log_file)
        terminal-notifier \
            -title "$title" \
            -message "$message" \
            -execute "open $log_file" \
            >/dev/null 2>&1 || true
    fi
    return 0
}
