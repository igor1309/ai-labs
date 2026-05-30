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


get_profile_dirs() {
    find "$PROFILES_DIR" -maxdepth 1 -type d -not -path "$PROFILES_DIR" | sort
}

get_active_profile_dir() {
    local current_account_id
    current_account_id="$(get_current_account_id)"
    local dirs=()
    while IFS= read -r line; do dirs+=("$line"); done < <(get_profile_dirs)

    for dir in "${dirs[@]}"; do
        if [[ -f "$AUTH_FILE" && -f "$dir/auth.json" ]] && cmp -s "$AUTH_FILE" "$dir/auth.json"; then
            echo "$dir"
            return
        fi
    done

    if [[ -f "$ACTIVE_FILE" ]]; then
        local marker
        marker="$(cat "$ACTIVE_FILE")"
        if [[ -n "$marker" && -d "$PROFILES_DIR/$marker" ]]; then
            echo "$PROFILES_DIR/$marker"
            return
        fi
    fi

    for dir in "${dirs[@]}"; do
        local profile_account_id
        profile_account_id="$(get_profile_account_id "$dir")"
        if [[ -n "$current_account_id" && -n "$profile_account_id" && "$profile_account_id" == "$current_account_id" ]]; then
            echo "$dir"
            return
        fi
    done
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
# Endpoint and field paths are sourced from the Codex CLI internals; see
# docs/research-codex-usage-api.md. Verify against the installed Codex version
# before relying on these values.
USAGE_URL="https://chatgpt.com/backend-api/wham/usage"
USAGE_USER_AGENT="codex-cli"

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

format_reset_timestamp() {
    local reset_epoch="$1"
    if [[ -z "$reset_epoch" || "$reset_epoch" == "null" ]]; then
        printf 'unknown'
        return 0
    fi
    local formatted
    formatted="$(TZ="$DISPLAY_TIMEZONE" date -r "$reset_epoch" '+%H:%M %d.%m' 2>/dev/null || true)"
    if [[ -n "$formatted" ]]; then
        printf '%s' "$formatted"
    else
        printf '%s' "$reset_epoch"
    fi
}

format_usage_window() {
    local payload="$1"
    local label="$2"
    local window_path="$3"
    local window
    window="$(printf '%s' "$payload" | jq -c "$window_path")"
    if [[ -z "$window" || "$window" == "null" ]]; then
        printf '  %-8s %s\n' "$label" "unknown"
        return 0
    fi
    local percent reset_epoch
    percent="$(printf '%s' "$payload" | jq -r "$window_path.used_percent // \"unknown\"")"
    reset_epoch="$(printf '%s' "$payload" | jq -r "$window_path.reset_at // empty")"
    printf '  %-8s%3s%% used, resets %s\n' "$label" "$percent" "$(format_reset_timestamp "$reset_epoch")"
}

format_usage_limits() {
    local payload="$1"
    printf '%s' "$payload" | jq -e '.rate_limit' >/dev/null 2>&1 || return 1
    format_usage_window "$payload" "5h:" '.rate_limit.primary_window'
    format_usage_window "$payload" "weekly:" '.rate_limit.secondary_window'
}

# Main logic
case "${1:-}" in
    "save")
        if [[ $# -lt 2 ]]; then
            echo "Error: email required. Usage: codex-mgr save <email>" >&2
            exit 1
        fi
        PROFILE_EMAIL="$2"
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
        PROFILE_PATH="$PROFILES_DIR/$PROFILE_NAME/auth.json"
        
        if [[ ! -f "$PROFILE_PATH" ]]; then
            echo "Error: Profile '$PROFILE_NAME' not found." >&2
            echo "Available: $(find "$PROFILES_DIR" -maxdepth 1 -type d -not -path "$PROFILES_DIR" -printf '%f\n' 2>/dev/null | sort || echo 'none')" >&2
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
        if [[ ! -d "$PROFILES_DIR" ]]; then
            echo "No profiles found."
            exit 1
        fi
        dirs=()
        while IFS= read -r line; do dirs+=("$line"); done < <(get_profile_dirs)
        if [[ ${#dirs[@]} -eq 0 ]]; then
            echo "No profiles saved yet."
            exit 1
        fi
        DISPLAY_TIMEZONE="$(resolve_display_timezone)"
        active_dir="$(get_active_profile_dir)"
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

            access_token="$(get_profile_access_token "$dir")"
            if [[ -z "$access_token" ]]; then
                echo "  unavailable: OAuth token not found"
                continue
            fi
            account_id="$(get_profile_account_id "$dir")"

            usage_payload="$(query_codex_usage "$access_token" "$account_id")" || {
                echo "  unavailable: usage request failed"
                continue
            }
            if [[ -z "$usage_payload" ]]; then
                echo "  unavailable: usage request failed"
                continue
            fi
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
