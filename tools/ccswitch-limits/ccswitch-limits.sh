#!/bin/sh
set -eu

output_mode=formatted
case "${1:-}" in
    '') ;;
    --json) output_mode=json ;;
    --help)
        printf 'Usage: %s [--json]\n' "$0"
        printf '  --json  emit one JSON object per account (JSON Lines)\n'
        exit 0
        ;;
    *)
        printf 'Usage: %s [--json]\n' "$0" >&2
        exit 2
        ;;
esac

sequence_file="${HOME}/.claude-switch-backup/sequence.json"
usage_url="https://api.anthropic.com/api/oauth/usage"
oauth_beta_header="oauth-2025-04-20"
refresh_margin_ms=300000
max_retry_after_seconds=30

runtime_dir=$(mktemp -d "${TMPDIR:-/tmp}/ccswitch-limits.XXXXXX")
trap 'rm -rf "$runtime_dir"' EXIT HUP INT TERM

read_keychain_service() {
    service_name=$1
    security find-generic-password -s "$service_name" -w 2>/dev/null || true
}

extract_access_token() {
    credentials_payload=$1

    if [ -z "$credentials_payload" ]; then
        return 0
    fi

    printf '%s' "$credentials_payload" | jq -r '.claudeAiOauth.accessToken // empty'
}

resolve_user_agent() {
    claude_version=$(claude --version 2>/dev/null | awk 'NR == 1 { print $1 }')

    if [ -n "$claude_version" ]; then
        printf 'claude-code/%s' "$claude_version"
        return 0
    fi

    printf 'claude-code/unknown'
}

credentials_expired() {
    credentials_payload=$1
    now_ms=$(($(date +%s) * 1000))

    printf '%s' "$credentials_payload" | jq -e \
        --argjson now_ms "$now_ms" \
        --argjson margin_ms "$refresh_margin_ms" \
        '.claudeAiOauth.expiresAt | numbers | . <= ($now_ms + $margin_ms)' >/dev/null 2>&1
}

query_usage_once() {
    access_token=$1
    user_agent=$2

    : >"$runtime_dir/usage-body"
    : >"$runtime_dir/usage-headers"
    usage_http_status=$(curl -sS --max-time 30 \
        -o "$runtime_dir/usage-body" \
        -D "$runtime_dir/usage-headers" \
        -w '%{http_code}' \
        "$usage_url" \
        -H "Authorization: Bearer $access_token" \
        -H "User-Agent: $user_agent" \
        -H "anthropic-beta: $oauth_beta_header" \
        -H 'Accept: application/json' 2>/dev/null) || usage_http_status=000
    usage_payload=$(cat "$runtime_dir/usage-body" 2>/dev/null || true)
    usage_retry_after=$(awk 'BEGIN { IGNORECASE=1 } /^retry-after:/ { sub(/^[^:]*:[[:space:]]*/, ""); gsub("\\r", ""); print; exit }' "$runtime_dir/usage-headers" 2>/dev/null || true)
}

retry_after_seconds() {
    retry_after=$1
    case "$retry_after" in
        '' | *[!0-9]*)
            retry_epoch=$(LC_ALL=C TZ=UTC date -j -f '%a, %d %b %Y %H:%M:%S GMT' "$retry_after" '+%s' 2>/dev/null || true)
            if [ -z "$retry_epoch" ]; then
                return 1
            fi
            now_epoch=$(date +%s)
            if [ "$retry_epoch" -le "$now_epoch" ]; then
                retry_delay=0
            else
                retry_delay=$((retry_epoch - now_epoch))
            fi
            ;;
        *) retry_delay=$retry_after ;;
    esac

    awk -v delay="$retry_delay" -v maximum="$max_retry_after_seconds" \
        'BEGIN { if (delay > maximum) print maximum; else print delay + 0 }'
}

query_usage_limits() {
    credentials_payload=$1

    access_token=$(extract_access_token "$credentials_payload")
    if [ -z "$access_token" ]; then
        return 1
    fi

    if credentials_expired "$credentials_payload"; then
        return 1
    fi

    waited_after_rate_limit=no
    while :; do
        query_usage_once "$access_token" "$user_agent"
        case "$usage_http_status" in
            200)
                printf '%s' "$usage_payload"
                return 0
                ;;
            401 | 403)
                return 1
                ;;
            429)
                if [ "$waited_after_rate_limit" = "yes" ] || [ -z "$usage_retry_after" ]; then
                    return 1
                fi
                retry_delay=$(retry_after_seconds "$usage_retry_after") || return 1
                sleep "$retry_delay"
                waited_after_rate_limit=yes
                ;;
            *)
                return 1
                ;;
        esac
    done
}

normalize_reset_timestamp() {
    reset_timestamp=$1

    case "$reset_timestamp" in
        *Z)
            printf '%s+0000' "${reset_timestamp%Z}"
            ;;
        *[+-]??:??)
            timezone_suffix=$(printf '%s' "$reset_timestamp" | sed -E 's/.*([+-][0-9]{2}:[0-9]{2})$/\1/')
            timestamp_without_timezone=${reset_timestamp%"$timezone_suffix"}
            timestamp_without_fraction=$(printf '%s' "$timestamp_without_timezone" | sed -E 's/\.[0-9]+$//')
            compact_timezone=$(printf '%s' "$timezone_suffix" | tr -d ':')
            printf '%s%s' "$timestamp_without_fraction" "$compact_timezone"
            ;;
        *)
            printf '%s' "$(printf '%s' "$reset_timestamp" | sed -E 's/\.[0-9]+$//')"
            ;;
    esac
}

resolve_display_timezone() {
    localtime_path=$(readlink /etc/localtime 2>/dev/null || true)
    display_timezone=$(printf '%s' "$localtime_path" | sed -n 's#^.*/zoneinfo/##p')

    if [ -n "$display_timezone" ]; then
        printf '%s' "$display_timezone"
        return 0
    fi

    printf 'Europe/Moscow'
}

format_reset_timestamp() {
    reset_timestamp=$1

    if [ -z "$reset_timestamp" ] || [ "$reset_timestamp" = "null" ]; then
        printf 'unknown'
        return 0
    fi

    normalized_reset_timestamp=$(normalize_reset_timestamp "$reset_timestamp")
    formatted_reset_timestamp=$(TZ="$display_timezone" date -j -f '%Y-%m-%dT%H:%M:%S%z' "$normalized_reset_timestamp" '+%H:%M %d.%m' 2>/dev/null || true)

    if [ -n "$formatted_reset_timestamp" ]; then
        printf '%s' "$formatted_reset_timestamp"
        return 0
    fi

    formatted_reset_timestamp=$(TZ="$display_timezone" date -j -f '%Y-%m-%dT%H:%M:%S' "$normalized_reset_timestamp" '+%H:%M %d.%m' 2>/dev/null || true)

    if [ -n "$formatted_reset_timestamp" ]; then
        printf '%s' "$formatted_reset_timestamp"
        return 0
    fi

    printf '%s' "$reset_timestamp"
}

format_usage_percentage() {
    utilization=$1

    if [ "$utilization" = "unknown" ]; then
        printf '%s' "$utilization"
        return 0
    fi

    printf '%3s' "$utilization"
}

format_usage_limits() {
    usage_payload=$1

    five_hour_utilization=$(printf '%s' "$usage_payload" | jq -r 'if .five_hour == null or .five_hour.utilization == null then "unknown" else (.five_hour.utilization | tostring | sub("\\.0$"; "")) end')
    five_hour_reset=$(printf '%s' "$usage_payload" | jq -r '.five_hour.resets_at // "unknown"')
    seven_day_utilization=$(printf '%s' "$usage_payload" | jq -r 'if .seven_day == null or .seven_day.utilization == null then "unknown" else (.seven_day.utilization | tostring | sub("\\.0$"; "")) end')
    seven_day_reset=$(printf '%s' "$usage_payload" | jq -r '.seven_day.resets_at // "unknown"')

    printf '  five_hour: %s%% used, resets %s\n' "$(format_usage_percentage "$five_hour_utilization")" "$(format_reset_timestamp "$five_hour_reset")"
    printf '  seven_day: %s%% used, resets %s\n' "$(format_usage_percentage "$seven_day_utilization")" "$(format_reset_timestamp "$seven_day_reset")"
}

emit_json_record() {
    account_number=$1
    account_email=$2
    is_active_account=$3
    status=$4
    usage_payload=${5:-}

    if [ "$status" = "ok" ]; then
        jq -cn \
            --arg account_number "$account_number" \
            --arg email "$account_email" \
            --argjson active "$([ "$is_active_account" = "yes" ] && printf true || printf false)" \
            --arg status "$status" \
            --argjson usage "$usage_payload" \
            '{account_number: ($account_number | tonumber), email: $email, active: $active, status: $status, usage: $usage}'
    else
        jq -cn \
            --arg account_number "$account_number" \
            --arg email "$account_email" \
            --argjson active "$([ "$is_active_account" = "yes" ] && printf true || printf false)" \
            --arg status "$status" \
            '{account_number: ($account_number | tonumber), email: $email, active: $active, status: $status}'
    fi
}

if [ ! -f "$sequence_file" ]; then
    printf 'Error: ccswitch sequence file not found at %s\n' "$sequence_file" >&2
    exit 1
fi

if ! jq -e '.sequence and (.sequence | length > 0)' "$sequence_file" >/dev/null 2>&1; then
    printf 'Error: no ccswitch-managed accounts found in %s\n' "$sequence_file" >&2
    exit 1
fi

user_agent=$(resolve_user_agent)
display_timezone=$(resolve_display_timezone)
tab_character=$(printf '\t')
printed_account_block=no

jq -r '.sequence[] as $account_number | [$account_number, .activeAccountNumber, (.accounts[($account_number | tostring)].email // "")] | @tsv' "$sequence_file" |
while IFS="$tab_character" read -r account_number active_account_number account_email; do
    if [ -z "$account_number" ]; then
        continue
    fi

    if [ "$output_mode" = "formatted" ] && [ "$printed_account_block" = "yes" ]; then
        printf '\n'
    fi
    printed_account_block=yes

    account_header="Account $account_number: $account_email"
    is_active_account=no

    if [ "$account_number" = "$active_account_number" ]; then
        account_header="$account_header (active)"
        is_active_account=yes
    fi

    if [ "$output_mode" = "formatted" ]; then
        printf '%s\n' "$account_header"
    fi

    account_service="Claude Code-Account-${account_number}-${account_email}"
    credentials_payload=$(read_keychain_service "$account_service")
    if [ "$is_active_account" = "yes" ]; then
        live_payload=$(read_keychain_service "Claude Code-credentials")
        if [ -n "$live_payload" ]; then
            credentials_payload=$live_payload
        fi
    fi

    if [ -z "$(extract_access_token "$credentials_payload")" ]; then
        if [ "$output_mode" = "json" ]; then
            emit_json_record "$account_number" "$account_email" "$is_active_account" oauth_token_not_found
        else
            printf '  unavailable: OAuth token not found\n'
        fi
        continue
    fi

    usage_payload=$(query_usage_limits "$credentials_payload") || true
    if [ -z "$usage_payload" ]; then
        if [ "$output_mode" = "json" ]; then
            emit_json_record "$account_number" "$account_email" "$is_active_account" usage_request_failed
        else
            printf '  unavailable: usage request failed\n'
        fi
        continue
    fi

    formatted_usage=$(format_usage_limits "$usage_payload") || {
        if [ "$output_mode" = "json" ]; then
            emit_json_record "$account_number" "$account_email" "$is_active_account" invalid_usage_response
        else
            printf '  unavailable: usage response was invalid\n'
        fi
        continue
    }

    if [ "$output_mode" = "json" ]; then
        emit_json_record "$account_number" "$account_email" "$is_active_account" ok "$usage_payload"
    else
        printf '%s\n' "$formatted_usage"
    fi
done
