#!/bin/bash
# codex-mgr - Standalone Codex CLI profile manager
# Usage: codex-mgr [save|load|list|switch|limits|delete] [email]

set -euo pipefail

PROFILES_DIR="${CODEX_PROFILES_DIR:-$HOME/.codex-profiles}"
AUTH_FILE="$HOME/.codex/auth.json"
ACTIVE_FILE="$PROFILES_DIR/.active"
VERSION="1.0.0"

# Ensure jq is available
if ! command -v jq &> /dev/null; then
    echo "Error: jq required. Install with 'brew install jq' or equivalent." >&2
    exit 1
fi

# Help message
show_help() {
    cat << EOF
codex-mgr $VERSION - Fast Codex CLI profile manager

USAGE:
    codex-mgr save <email>         # Save current auth as profile (name = email)
    codex-mgr load <email>         # Load profile (switches active auth)
    codex-mgr list                 # List profiles with active (*) indicator
    codex-mgr switch               # Switch to next profile in list
    codex-mgr limits               # Show usage limits per profile
    codex-mgr limits --json        # Same, one JSON line per profile
    codex-mgr delete <email>       # Delete a saved profile
    codex-mgr help                # Show this help

EXAMPLES:
    codex-mgr save work@example.com
    codex-mgr save personal@example.com
    codex-mgr list
    codex-mgr load work@example.com
    codex-mgr switch
    codex-mgr limits
    codex-mgr delete personal@example.com

CONFIG:
    CODEX_PROFILES_DIR=/path/to/profiles  # Override default ~/.codex-profiles

NOTES:
    - Auth stored in $AUTH_FILE
    - Profiles stored in $PROFILES_DIR
    - No .zshrc modification needed - standalone script
    - List output format: "* <profile>" for active profile
EOF
}

get_auth_field() {
    local file="$1"
    local filter="$2"
    if [[ -f "$file" && -s "$file" ]]; then
        jq -r "$filter" "$file" 2>/dev/null || true
    fi
}

get_current_account_id() {
    get_auth_field "$AUTH_FILE" '.account_id // .tokens.account_id // empty'
}

get_profile_account_id() {
    local profile_dir="$1"
    local meta_file="$profile_dir/profile.json"
    local account_id=""
    if [[ -f "$meta_file" ]]; then
        account_id="$(get_auth_field "$meta_file" '.account_id // empty')"
    fi
    if [[ -z "$account_id" ]]; then
        account_id="$(get_auth_field "$profile_dir/auth.json" '.account_id // .tokens.account_id // empty')"
    fi
    echo "$account_id"
}


# Profile names are directory names under $PROFILES_DIR; reject any that
# would resolve elsewhere (empty, ".", "..", or containing "/"), since load
# copies from and delete removes that directory.
require_profile_name() {
    local name="$1"
    if [[ -z "$name" || "$name" == "." || "$name" == ".." || "$name" == *"/"* ]]; then
        echo "Error: invalid profile name '$name'." >&2
        exit 1
    fi
}

get_profile_dirs() {
    find "$PROFILES_DIR" -maxdepth 1 -type d -not -path "$PROFILES_DIR" | sort
}

get_active_profile_dir() {
    local current_account_id marker marker_dir marker_account_id
    current_account_id="$(get_current_account_id)"
    local dirs=()
    while IFS= read -r line; do dirs+=("$line"); done < <(get_profile_dirs)

    for dir in "${dirs[@]}"; do
        if [[ -f "$AUTH_FILE" && -f "$dir/auth.json" ]] && cmp -s "$AUTH_FILE" "$dir/auth.json"; then
            echo "$dir"
            return
        fi
    done

    local account_matches=()
    for dir in "${dirs[@]}"; do
        local profile_account_id
        profile_account_id="$(get_profile_account_id "$dir")"
        if [[ -n "$current_account_id" && -n "$profile_account_id" && "$profile_account_id" == "$current_account_id" ]]; then
            account_matches+=("$dir")
        fi
    done
    if [[ ${#account_matches[@]} -eq 1 ]]; then
        echo "${account_matches[0]}"
        return
    fi

    if [[ -f "$ACTIVE_FILE" ]]; then
        marker="$(cat "$ACTIVE_FILE")"
        marker_dir="$PROFILES_DIR/$marker"
        if [[ -n "$marker" && -d "$marker_dir" ]]; then
            marker_account_id="$(get_profile_account_id "$marker_dir")"
            # A marker is only authoritative when the live identity is absent
            # or agrees with it. Never attach live app-server data to a stale,
            # contradictory marker.
            if [[ -z "$current_account_id" || "$marker_account_id" == "$current_account_id" ]]; then
                echo "$marker_dir"
                return
            fi
        fi
    fi

    if [[ ${#account_matches[@]} -gt 0 ]]; then
        for dir in "${account_matches[@]}"; do
            if [[ "$dir" == "${marker_dir:-}" ]]; then
                echo "$dir"
                return
            fi
        done
    fi
}

validate_app_server_buckets() {
    jq -e '
        def valid_window:
            type == "object"
            and (.usedPercent | type) == "number"
            and (.windowDurationMins | type) == "number"
            and (.resetsAt | type) == "number";
        (if ((.rateLimitsByLimitId | type) == "object" and (.rateLimitsByLimitId | length) > 0)
         then [.rateLimitsByLimitId[]]
         elif (.rateLimits | type) == "object"
         then [.rateLimits]
         else [] end) as $buckets
        | ($buckets | length) > 0
          and any($buckets[]; ((.primary | valid_window) or (.secondary | valid_window)))
    ' >/dev/null 2>&1
}

validate_wham_payload() {
    jq -e '
        def valid_window:
            type == "object"
            and (.used_percent | type) == "number"
            and (.limit_window_seconds | type) == "number"
            and (.reset_at | type) == "number";
        (.rate_limit | type) == "object"
        and ((.rate_limit.primary_window | valid_window) or (.rate_limit.secondary_window | valid_window))
    ' >/dev/null 2>&1
}

# Codex CLI rotates refresh tokens in-place: each refresh invalidates the
# previous one. Persist the live auth back to the active profile before
# switching away so the snapshot tracks the latest rotated token; otherwise
# loading the profile later restores a consumed token and forces re-login.
sync_active_profile_from_live() {
    [[ -f "$AUTH_FILE" && -s "$AUTH_FILE" ]] || return 0
    local active_dir
    active_dir="$(get_active_profile_dir)"
    [[ -n "$active_dir" && -d "$active_dir" ]] || return 0

    local live_account_id profile_account_id
    live_account_id="$(get_current_account_id)"
    profile_account_id="$(get_profile_account_id "$active_dir")"
    if [[ -n "$live_account_id" && -n "$profile_account_id" && "$live_account_id" != "$profile_account_id" ]]; then
        return 0
    fi

    cp -p "$AUTH_FILE" "$active_dir/auth.json"
}

# Usage/limits reporting (mirrors tools/ccswitch-limits for Codex profiles).
# Endpoint and field paths are sourced from the Codex CLI internals and were
# verified against the live endpoint on 2026-05-30; see
# docs/research-codex-usage-api.md. Re-verify if Codex changes the contract.
USAGE_URL="https://chatgpt.com/backend-api/wham/usage"
USAGE_USER_AGENT="codex-cli"
FIVE_HOUR_MINS=300
SEVEN_DAY_MINS=10080

get_profile_access_token() {
    local profile_dir="$1"
    get_auth_field "$profile_dir/auth.json" '.tokens.access_token // .access_token // empty'
}

resolve_display_timezone() {
    local localtime_path display_timezone
    localtime_path="$(readlink /etc/localtime 2>/dev/null || true)"
    display_timezone="$(printf '%s' "$localtime_path" | sed -n 's#^.*/zoneinfo/##p')"
    if [[ -n "$display_timezone" ]]; then
        printf '%s' "$display_timezone"
        return 0
    fi
    printf 'UTC'
}

query_codex_usage() {
    local access_token="$1"
    local account_id="$2"
    local headers=(-H "Authorization: Bearer $access_token")
    if [[ -n "$account_id" ]]; then
        headers+=(-H "ChatGPT-Account-Id: $account_id")
    fi
    headers+=(-H "User-Agent: $USAGE_USER_AGENT")
    curl -fsS "$USAGE_URL" "${headers[@]}" 2>/dev/null
}

stop_app_server() {
    local server_pid="$1"
    local attempt process_state

    for attempt in {1..10}; do
        process_state="$(ps -o stat= -p "$server_pid" 2>/dev/null || true)"
        if [[ -z "$process_state" || "$process_state" == *Z* ]]; then
            wait "$server_pid" 2>/dev/null || true
            return 0
        fi
        sleep 0.05
    done

    kill -TERM "$server_pid" 2>/dev/null || true
    for attempt in {1..20}; do
        process_state="$(ps -o stat= -p "$server_pid" 2>/dev/null || true)"
        if [[ -z "$process_state" || "$process_state" == *Z* ]]; then
            wait "$server_pid" 2>/dev/null || true
            return 0
        fi
        sleep 0.05
    done

    kill -KILL "$server_pid" 2>/dev/null || true
    for attempt in {1..20}; do
        process_state="$(ps -o stat= -p "$server_pid" 2>/dev/null || true)"
        if [[ -z "$process_state" || "$process_state" == *Z* ]]; then
            wait "$server_pid" 2>/dev/null || true
            return 0
        fi
        sleep 0.05
    done
}

cleanup_app_server() {
    local server_pid="$1"
    local request_dir="$2"
    exec 3>&- 2>/dev/null || true
    stop_app_server "$server_pid"
    rm -rf "$request_dir"
}

# Query the supported Codex account API. This runs only against the live
# CODEX_HOME, so Codex itself owns any token refresh and persistence.
query_app_server_rate_limits() (
    local request_dir input_fifo output_file server_pid response attempt
    request_dir="$(mktemp -d "${TMPDIR:-/tmp}/codex-mgr-app-server.XXXXXX")"
    input_fifo="$request_dir/input"
    output_file="$request_dir/output"
    mkfifo "$input_fifo"

    codex app-server <"$input_fifo" >"$output_file" 2>/dev/null &
    server_pid=$!
    trap 'cleanup_app_server "$server_pid" "$request_dir"' EXIT
    trap 'cleanup_app_server "$server_pid" "$request_dir"; trap - EXIT; exit 130' HUP INT TERM
    exec 3>"$input_fifo"

    if ! printf '%s\n' '{"method":"initialize","id":0,"params":{"clientInfo":{"name":"codex_mgr","title":"codex-mgr","version":"1.0.0"}}}' >&3; then
        return 1
    fi
    for ((attempt = 0; attempt < 100; attempt++)); do
        if grep -q '"id":0' "$output_file" 2>/dev/null; then
            break
        fi
        if ! kill -0 "$server_pid" 2>/dev/null; then
            break
        fi
        sleep 0.05
    done

    if ! grep -q '"id":0' "$output_file" 2>/dev/null; then
        return 1
    fi

    if ! printf '%s\n' '{"method":"initialized","params":{}}' '{"method":"account/rateLimits/read","id":2,"params":{}}' >&3; then
        return 1
    fi
    for ((attempt = 0; attempt < 200; attempt++)); do
        if grep -q '"id":2' "$output_file" 2>/dev/null; then
            break
        fi
        if ! kill -0 "$server_pid" 2>/dev/null; then
            break
        fi
        sleep 0.05
    done

    exec 3>&-
    stop_app_server "$server_pid"
    response="$(jq -c 'select(.id == 2 and .result != null) | .result' "$output_file" 2>/dev/null | tail -n 1)"
    [[ -n "$response" ]] || return 1
    printf '%s' "$response"
)

normalize_app_server_usage() {
    local payload="$1"
    printf '%s' "$payload" | jq -c --argjson five_hour "$FIVE_HOUR_MINS" --argjson seven_day "$SEVEN_DAY_MINS" '
        def window:
            if . == null then null else {
                utilization: .usedPercent,
                resets_at: (if (.resetsAt | type) == "number" then (.resetsAt | todate) else null end),
                window_duration_mins: .windowDurationMins
            } end;
        def all_buckets:
            if ((.rateLimitsByLimitId | type) == "object" and (.rateLimitsByLimitId | length) > 0) then .rateLimitsByLimitId
            elif (.rateLimits | type) == "object" then {((.rateLimits.limitId // "codex")): .rateLimits}
            else {} end;
        (all_buckets) as $buckets
        | ([ $buckets[] | .primary, .secondary | select(. != null and .windowDurationMins == $five_hour) ][0] // null) as $five
        | ([ $buckets[] | .primary, .secondary | select(. != null and .windowDurationMins == $seven_day) ][0] // null) as $seven
        | {
            usage: {five_hour: ($five | window), seven_day: ($seven | window)},
            limit_buckets: ($buckets | to_entries | map({
                limit_id: (.value.limitId // .key),
                limit_name: .value.limitName,
                plan_type: .value.planType,
                primary: (.value.primary | window),
                secondary: (.value.secondary | window),
                credits: .value.credits,
                individual_limit: .value.individualLimit,
                spend_control_reached: .value.spendControlReached,
                rate_limit_reached_type: .value.rateLimitReachedType
            })),
            reset_credits: {
                available_count: (.rateLimitResetCredits.availableCount // 0),
                applicable_available_count: null,
                credits: (.rateLimitResetCredits.credits // [])
            }
        }
    '
}

normalize_wham_usage() {
    local payload="$1"
    printf '%s' "$payload" | jq -c --argjson five_hour "$FIVE_HOUR_MINS" --argjson seven_day "$SEVEN_DAY_MINS" '
        def window:
            if . == null then null else {
                utilization: .used_percent,
                resets_at: (if (.reset_at | type) == "number" then (.reset_at | todate) else null end),
                window_duration_mins: (if (.limit_window_seconds | type) == "number" then (.limit_window_seconds / 60) else null end)
            } end;
        . as $root
        | def bucket($id; $name; $rate): {
            limit_id: $id,
            limit_name: $name,
            plan_type: $root.plan_type,
            primary: ($rate.primary_window | window),
            secondary: ($rate.secondary_window | window),
            credits: $root.credits,
            individual_limit: null,
            spend_control_reached: ($root.spend_control.reached // null),
            rate_limit_reached_type: $root.rate_limit_reached_type
        };
        ([bucket("codex"; null; .rate_limit)] + [
            .additional_rate_limits[]?
            | bucket((.metered_feature // .limit_name // "additional"); .limit_name; .rate_limit)
          ]) as $buckets
        | ([ $buckets[] | .primary, .secondary | select(. != null and .window_duration_mins == $five_hour) ][0] // null) as $five
        | ([ $buckets[] | .primary, .secondary | select(. != null and .window_duration_mins == $seven_day) ][0] // null) as $seven
        | {
            usage: {five_hour: $five, seven_day: $seven},
            limit_buckets: $buckets,
            reset_credits: {
                available_count: (.rate_limit_reset_credits.available_count // 0),
                applicable_available_count: (.rate_limit_reset_credits.applicable_available_count // null),
                credits: (.rate_limit_reset_credits.credits // [])
            }
        }
    '
}

format_iso_reset_timestamp() {
    local reset_timestamp="$1"
    if [[ -z "$reset_timestamp" || "$reset_timestamp" == "null" ]]; then
        printf 'unknown'
        return 0
    fi
    local normalized formatted
    normalized="${reset_timestamp%Z}+0000"
    formatted="$(TZ="$DISPLAY_TIMEZONE" date -j -f '%Y-%m-%dT%H:%M:%S%z' "$normalized" '+%H:%M %d.%m' 2>/dev/null || true)"
    if [[ -n "$formatted" ]]; then
        printf '%s' "$formatted"
    else
        printf '%s' "$reset_timestamp"
    fi
}

format_usage_limits() {
    local payload="$1"
    printf '%s' "$payload" | jq -e '.usage and (.limit_buckets | type == "array")' >/dev/null 2>&1 || return 1

    local tab_character
    tab_character=$'\t'
    while IFS="$tab_character" read -r limit_id limit_name window_slot percent reset_timestamp duration_mins; do
        local bucket_label window_label
        [[ "$limit_name" == "__none__" ]] && limit_name=""
        [[ "$reset_timestamp" == "__none__" ]] && reset_timestamp=""
        [[ "$duration_mins" == "__none__" ]] && duration_mins=""
        bucket_label="$limit_name"
        [[ -n "$bucket_label" ]] || bucket_label="$limit_id"
        case "$duration_mins" in
            "$FIVE_HOUR_MINS") window_label="5h:" ;;
            "$SEVEN_DAY_MINS") window_label="weekly:" ;;
            "") window_label="$window_slot:" ;;
            *) window_label="${duration_mins}m:" ;;
        esac
        if [[ "$limit_id" != "codex" || -n "$limit_name" ]]; then
            window_label="$bucket_label $window_label"
        fi
        printf '  %-20s%3s%% used, resets %s\n' "$window_label" "${percent:-unknown}" "$(format_iso_reset_timestamp "$reset_timestamp")"
    done < <(printf '%s' "$payload" | jq -r '
        .limit_buckets[]
        | . as $bucket
        | ["primary", "secondary"][] as $slot
        | $bucket[$slot]
        | select(. != null)
        | [$bucket.limit_id, ($bucket.limit_name // "__none__"), $slot, (.utilization // "unknown"), (.resets_at // "__none__"), (.window_duration_mins // "__none__")]
        | @tsv
    ')

    local available applicable
    available="$(printf '%s' "$payload" | jq -r '.reset_credits.available_count // 0')"
    applicable="$(printf '%s' "$payload" | jq -r '.reset_credits.applicable_available_count // empty')"
    if [[ -n "$applicable" ]]; then
        printf '  reset credits: %s available, %s currently applicable\n' "$available" "$applicable"
    else
        printf '  reset credits: %s available\n' "$available"
    fi
}

# One JSON line per profile, in the record shape of `ccswitch-limits --json`
# so account-rotation/select-account.sh can rank Codex profiles:
# account_number is the profile's 1-based position in list order, and each
# window becomes {utilization, resets_at} with resets_at as ISO 8601 UTC.
emit_limits_record() {
    local account_number="$1"
    local profile="$2"
    local is_active="$3"
    local status="$4"
    local source="${5:-none}"
    local payload="${6:-null}"

    jq -cn \
        --argjson account_number "$account_number" \
        --arg email "$profile" \
        --argjson active "$is_active" \
        --arg status "$status" \
        --arg source "$source" \
        --argjson payload "$payload" '
        {account_number: $account_number, email: $email, active: $active, status: $status}
        + if $status == "ok"
          then {source: $source} + $payload
          else {}
          end
    '
}

query_profile_limits() {
    local profile_dir="$1"
    local is_active="$2"
    local raw_payload normalized access_token account_id

    if [[ "$is_active" == "true" ]]; then
        raw_payload="$(query_app_server_rate_limits)" || raw_payload=""
        if [[ -n "$raw_payload" ]] && validate_app_server_buckets <<<"$raw_payload"; then
            normalized="$(normalize_app_server_usage "$raw_payload" 2>/dev/null)" || normalized=""
            if [[ -n "$normalized" ]]; then
                jq -cn --arg source app_server --argjson payload "$normalized" '{source: $source, payload: $payload}'
                return 0
            fi
        fi

        # Compatibility fallback only. The live auth file remains authoritative
        # for the active account; never fall back to its saved profile copy.
        access_token="$(get_auth_field "$AUTH_FILE" '.tokens.access_token // .access_token // empty')"
        account_id="$(get_current_account_id)"
    else
        # Inactive profiles are read-only snapshots. A direct usage request is
        # allowed, but codex-mgr never refreshes or rewrites their credentials.
        access_token="$(get_profile_access_token "$profile_dir")"
        account_id="$(get_profile_account_id "$profile_dir")"
    fi

    [[ -n "$access_token" ]] || return 2
    raw_payload="$(query_codex_usage "$access_token" "$account_id")" || return 1
    [[ -n "$raw_payload" ]] || return 1
    validate_wham_payload <<<"$raw_payload" || return 3
    normalized="$(normalize_wham_usage "$raw_payload" 2>/dev/null)" || return 3
    [[ -n "$normalized" ]] || return 3
    jq -cn --arg source wham_fallback --argjson payload "$normalized" '{source: $source, payload: $payload}'
}

# Main logic
case "${1:-}" in
    "save")
        if [[ $# -lt 2 ]]; then
            echo "Error: email required. Usage: codex-mgr save <email>" >&2
            exit 1
        fi
        PROFILE_EMAIL="$2"
        require_profile_name "$PROFILE_EMAIL"
        PROFILE_NAME="$PROFILE_EMAIL"
        if [[ "$PROFILE_EMAIL" != *"@"* ]]; then
            echo "Error: email must contain '@'. Usage: codex-mgr save <email>" >&2
            exit 1
        fi
        if [[ ! -f "$AUTH_FILE" ]]; then
            echo "Error: auth file not found at $AUTH_FILE. Please sign in to Codex CLI first." >&2
            exit 1
        fi
        if [[ ! -s "$AUTH_FILE" ]]; then
            echo "Error: auth file at $AUTH_FILE is empty. Please sign in to Codex CLI again." >&2
            exit 1
        fi
        mkdir -p "$PROFILES_DIR/$PROFILE_NAME"
        cp "$AUTH_FILE" "$PROFILES_DIR/$PROFILE_NAME/auth.json"
        PROFILE_ACCOUNT_ID="$(get_auth_field "$AUTH_FILE" '.account_id // .tokens.account_id // empty')"
        jq -n \
            --arg name "$PROFILE_NAME" \
            --arg email "$PROFILE_EMAIL" \
            --arg account_id "$PROFILE_ACCOUNT_ID" \
            '{name: $name, email: $email, account_id: $account_id}' \
            > "$PROFILES_DIR/$PROFILE_NAME/profile.json"
        echo "✓ Saved profile: $PROFILE_NAME"
        ;;
    
    "load")
        if [[ $# -lt 2 ]]; then
            echo "Error: profile name required. Usage: codex-mgr load <profile>" >&2
            exit 1
        fi
        PROFILE_NAME="$2"
        require_profile_name "$PROFILE_NAME"
        PROFILE_PATH="$PROFILES_DIR/$PROFILE_NAME/auth.json"
        
        if [[ ! -f "$PROFILE_PATH" ]]; then
            echo "Error: Profile '$PROFILE_NAME' not found." >&2
            available="$(get_profile_dirs 2>/dev/null | while IFS= read -r dir; do basename "$dir"; done | paste -sd ' ' - || true)"
            echo "Available: ${available:-none}" >&2
            exit 1
        fi
        if [[ ! -s "$PROFILE_PATH" ]]; then
            echo "Error: Profile auth at $PROFILE_PATH is empty. Re-save the profile." >&2
            exit 1
        fi

        sync_active_profile_from_live

        # Backup current
        [[ -f "$AUTH_FILE" ]] && cp "$AUTH_FILE" "$AUTH_FILE.backup.$(date +%s)"

        # Switch
        cp "$PROFILE_PATH" "$AUTH_FILE"
        echo "$PROFILE_NAME" > "$ACTIVE_FILE"
        echo "✓ Switched to: $PROFILE_NAME"
        ;;
    
    "list")
        CURRENT_ACCOUNT_ID="$(get_current_account_id)"
        if [[ ! -d "$PROFILES_DIR" ]]; then
            echo "No profiles found."
            exit 0
        fi
        if [[ -z "$(get_profile_dirs | head -n 1)" ]]; then
            echo "No profiles saved yet."
            exit 0
        fi
        
        echo "Codex Profiles"
        echo "--------------"
        dirs=()
        while IFS= read -r line; do dirs+=("$line"); done < <(get_profile_dirs)
        active=""
        for dir in "${dirs[@]}"; do
            if [[ -f "$AUTH_FILE" && -f "$dir/auth.json" ]] && cmp -s "$AUTH_FILE" "$dir/auth.json"; then
                active="$dir"
                break
            fi
        done
        if [[ -z "$active" && -f "$ACTIVE_FILE" ]]; then
            marker="$(cat "$ACTIVE_FILE")"
            if [[ -d "$PROFILES_DIR/$marker" ]]; then
                active="$PROFILES_DIR/$marker"
            fi
        fi
        if [[ -z "$active" ]]; then
            for dir in "${dirs[@]}"; do
                profile_account_id="$(get_profile_account_id "$dir")"
                if [[ -n "$CURRENT_ACCOUNT_ID" && -n "$profile_account_id" && "$profile_account_id" == "$CURRENT_ACCOUNT_ID" ]]; then
                    active="$dir"
                    break
                fi
            done
        fi
        for dir in "${dirs[@]}"; do
            profile=$(basename "$dir")
            if [[ "$dir" == "$active" ]]; then
                echo "  * $profile"
            else
                echo "    $profile"
            fi
        done
        ;;
    
    "switch")
        if [[ ! -d "$PROFILES_DIR" ]]; then
            echo "No profiles found."
            exit 1
        fi
        profiles=()
        while IFS= read -r line; do profiles+=("$line"); done < <(get_profile_dirs)
        if [[ ${#profiles[@]} -eq 0 ]]; then
            echo "No profiles saved yet."
            exit 1
        fi
        if [[ ${#profiles[@]} -eq 1 ]]; then
            echo "Only one profile saved. Nothing to switch."
            exit 0
        fi
        CURRENT_ACCOUNT_ID="$(get_current_account_id)"
        current_index=-1
        for i in "${!profiles[@]}"; do
            if [[ -f "$AUTH_FILE" && -f "${profiles[$i]}/auth.json" ]] && cmp -s "$AUTH_FILE" "${profiles[$i]}/auth.json"; then
                current_index="$i"
                break
            fi
        done
        if [[ "$current_index" -lt 0 && -f "$ACTIVE_FILE" ]]; then
            marker="$(cat "$ACTIVE_FILE")"
            for i in "${!profiles[@]}"; do
                if [[ "$(basename "${profiles[$i]}")" == "$marker" ]]; then
                    current_index="$i"
                    break
                fi
            done
        fi
        if [[ "$current_index" -lt 0 ]]; then
            for i in "${!profiles[@]}"; do
                profile_account_id="$(get_profile_account_id "${profiles[$i]}")"
                if [[ -n "$CURRENT_ACCOUNT_ID" && -n "$profile_account_id" && "$profile_account_id" == "$CURRENT_ACCOUNT_ID" ]]; then
                    current_index="$i"
                    break
                fi
            done
        fi
        if [[ "$current_index" -lt 0 ]]; then
            next_index=0
        else
            next_index=$(( (current_index + 1) % ${#profiles[@]} ))
        fi
        next_dir="${profiles[$next_index]}"
        next_profile="$(basename "$next_dir")"

        sync_active_profile_from_live

        [[ -f "$AUTH_FILE" ]] && cp "$AUTH_FILE" "$AUTH_FILE.backup.$(date +%s)"
        cp "$next_dir/auth.json" "$AUTH_FILE"
        echo "$next_profile" > "$ACTIVE_FILE"
        echo "✓ Switched to: $next_profile"
        ;;
    
    "limits")
        case "${2:-}" in
            "") output_mode=text ;;
            "--json") output_mode=json ;;
            *)
                echo "Error: Usage: codex-mgr limits [--json]" >&2
                exit 1
                ;;
        esac
        if [[ ! -d "$PROFILES_DIR" ]]; then
            echo "No profiles found." >&2
            exit 1
        fi
        dirs=()
        while IFS= read -r line; do dirs+=("$line"); done < <(get_profile_dirs)
        if [[ ${#dirs[@]} -eq 0 ]]; then
            echo "No profiles saved yet." >&2
            exit 1
        fi
        active_dir="$(get_active_profile_dir)"

        if [[ "$output_mode" == "json" ]]; then
            account_number=0
            for dir in "${dirs[@]}"; do
                account_number=$((account_number + 1))
                profile="$(basename "$dir")"
                is_active=false
                [[ "$dir" == "$active_dir" ]] && is_active=true

                query_status=0
                query_result="$(query_profile_limits "$dir" "$is_active")" || query_status=$?
                case "$query_status" in
                    0)
                        usage_source="$(printf '%s' "$query_result" | jq -r '.source')"
                        usage_payload="$(printf '%s' "$query_result" | jq -c '.payload')"
                        emit_limits_record "$account_number" "$profile" "$is_active" ok "$usage_source" "$usage_payload"
                        ;;
                    2) emit_limits_record "$account_number" "$profile" "$is_active" oauth_token_not_found ;;
                    3) emit_limits_record "$account_number" "$profile" "$is_active" invalid_usage_response ;;
                    *) emit_limits_record "$account_number" "$profile" "$is_active" usage_request_failed ;;
                esac
            done
            exit 0
        fi

        DISPLAY_TIMEZONE="$(resolve_display_timezone)"
        printed_block=no
        for dir in "${dirs[@]}"; do
            if [[ "$printed_block" == "yes" ]]; then
                echo ""
            fi
            printed_block=yes

            profile="$(basename "$dir")"
            if [[ "$dir" == "$active_dir" ]]; then
                echo "$profile (active)"
            else
                echo "$profile"
            fi

            is_active=false
            [[ "$dir" == "$active_dir" ]] && is_active=true
            query_status=0
            query_result="$(query_profile_limits "$dir" "$is_active")" || query_status=$?
            case "$query_status" in
                0) usage_payload="$(printf '%s' "$query_result" | jq -c '.payload')" ;;
                2)
                    echo "  unavailable: OAuth token not found"
                    continue
                    ;;
                3)
                    echo "  unavailable: usage response was invalid"
                    continue
                    ;;
                *)
                    echo "  unavailable: usage request failed"
                    continue
                    ;;
            esac
            formatted_usage="$(format_usage_limits "$usage_payload")" || {
                echo "  unavailable: usage response was invalid"
                continue
            }
            printf '%s\n' "$formatted_usage"
        done
        ;;

    "delete")
        if [[ $# -lt 2 ]]; then
            echo "Error: email required. Usage: codex-mgr delete <email>" >&2
            exit 1
        fi
        PROFILE_NAME="$2"
        require_profile_name "$PROFILE_NAME"
        PROFILE_PATH="$PROFILES_DIR/$PROFILE_NAME"
        if [[ ! -d "$PROFILE_PATH" ]]; then
            echo "Error: Profile '$PROFILE_NAME' not found." >&2
            exit 1
        fi
        rm -rf "$PROFILE_PATH"
        if [[ -f "$ACTIVE_FILE" && "$(cat "$ACTIVE_FILE")" == "$PROFILE_NAME" ]]; then
            rm -f "$ACTIVE_FILE"
            echo "⚠ Deleted active profile '$PROFILE_NAME'. No profile is now active."
        else
            echo "✓ Deleted profile: $PROFILE_NAME"
        fi
        ;;

    "help"|"-h"|"--help")
        show_help
        ;;
    
    "")
        show_help
        ;;
    
    *)
        echo "Error: Unknown command '$1'. See 'codex-mgr help'" >&2
        exit 1
        ;;
esac
