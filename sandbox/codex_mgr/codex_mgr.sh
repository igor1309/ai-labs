#!/bin/bash
# codex-mgr - Standalone Codex CLI profile manager
# Usage: codex-mgr [save|load|list|switch] [email]

set -euo pipefail

PROFILES_DIR="${CODEX_PROFILES_DIR:-$HOME/.codex-profiles}"
AUTH_FILE="$HOME/.codex/auth.json"
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
    codex-mgr help                # Show this help

EXAMPLES:
    codex-mgr save work@example.com
    codex-mgr save personal@example.com
    codex-mgr list
    codex-mgr load work@example.com
    codex-mgr switch

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

is_profile_active() {
    local profile_dir="$1"
    local profile_account_id="$2"
    local current_account_id="$3"
    if [[ -f "$AUTH_FILE" && -f "$profile_dir/auth.json" ]] && cmp -s "$AUTH_FILE" "$profile_dir/auth.json"; then
        return 0
    fi
    if [[ -n "$current_account_id" && -n "$profile_account_id" ]]; then
        [[ "$profile_account_id" == "$current_account_id" ]]
        return $?
    fi
    return 1
}

get_profile_dirs() {
    find "$PROFILES_DIR" -maxdepth 1 -type d -not -path "$PROFILES_DIR" | sort
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
        
        # Backup current
        [[ -f "$AUTH_FILE" ]] && cp "$AUTH_FILE" "$AUTH_FILE.backup.$(date +%s)"
        
        # Switch
        cp "$PROFILE_PATH" "$AUTH_FILE"
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
            profile_dir="${profiles[$i]}"
            profile_account_id="$(get_profile_account_id "$profile_dir")"
            if is_profile_active "$profile_dir" "$profile_account_id" "$CURRENT_ACCOUNT_ID"; then
                current_index="$i"
                break
            fi
        done
        if [[ "$current_index" -lt 0 ]]; then
            next_index=0
        else
            next_index=$(( (current_index + 1) % ${#profiles[@]} ))
        fi
        next_dir="${profiles[$next_index]}"
        next_profile="$(basename "$next_dir")"
        
        [[ -f "$AUTH_FILE" ]] && cp "$AUTH_FILE" "$AUTH_FILE.backup.$(date +%s)"
        cp "$next_dir/auth.json" "$AUTH_FILE"
        echo "✓ Switched to: $next_profile"
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
