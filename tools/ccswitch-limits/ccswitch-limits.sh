#!/bin/sh
set -eu

sequence_file="${HOME}/.claude-switch-backup/sequence.json"
usage_url="https://api.anthropic.com/api/oauth/usage"
oauth_beta_header="oauth-2025-04-20"

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

query_usage_limits() {
    access_token=$1
    user_agent=$2

    curl -fsS "$usage_url" -H "Authorization: Bearer $access_token" -H "User-Agent: $user_agent" -H "anthropic-beta: $oauth_beta_header" -H "Accept: application/json" 2>/dev/null
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

    if [ "$printed_account_block" = "yes" ]; then
        printf '\n'
    fi
    printed_account_block=yes

    account_header="Account $account_number: $account_email"
    is_active_account=no

    if [ "$account_number" = "$active_account_number" ]; then
        account_header="$account_header (active)"
        is_active_account=yes
    fi

    printf '%s\n' "$account_header"

    account_token=$(extract_access_token "$(read_keychain_service "Claude Code-Account-${account_number}-${account_email}")")
    active_token=""
    if [ "$is_active_account" = "yes" ]; then
        active_token=$(extract_access_token "$(read_keychain_service "Claude Code-credentials")")
    fi

    if [ -z "$account_token" ] && [ -z "$active_token" ]; then
        printf '  unavailable: OAuth token not found\n'
        continue
    fi

    usage_payload=""
    if [ -n "$account_token" ]; then
        usage_payload=$(query_usage_limits "$account_token" "$user_agent") || true
    fi
    if [ -z "$usage_payload" ] && [ -n "$active_token" ] && [ "$active_token" != "$account_token" ]; then
        usage_payload=$(query_usage_limits "$active_token" "$user_agent") || true
    fi
    if [ -z "$usage_payload" ]; then
        printf '  unavailable: usage request failed\n'
        continue
    fi

    formatted_usage=$(format_usage_limits "$usage_payload") || {
        printf '  unavailable: usage response was invalid\n'
        continue
    }

    printf '%s\n' "$formatted_usage"
done
