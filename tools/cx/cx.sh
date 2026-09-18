#!/bin/sh
set -eu

# cx [email] [session-id] [codex args...]
#
# Launches Codex on a codex-mgr profile:
# - an email switches to that profile;
# - otherwise the profile is picked by account-rotation/select-account.sh --codex;
# - a session ID resumes that session.
# A failed selection or switch is reported and codex still starts on the
# current profile.

script_path=$0
while [ -L "$script_path" ]; do
    link_target=$(readlink "$script_path")
    case "$link_target" in
        /*) script_path=$link_target ;;
        *) script_path=$(dirname "$script_path")/$link_target ;;
    esac
done
tool_dir=$(CDPATH= cd -- "$(dirname "$script_path")" && pwd)

select_account_script=${CX_SELECT_ACCOUNT_SCRIPT:-"$tool_dir/../account-rotation/select-account.sh"}
codex_mgr_command=${CX_CODEX_MGR_COMMAND:-"$tool_dir/../codex-mgr/codex-mgr.sh"}
codex_command=${CX_CODEX_COMMAND:-codex}
failure_pause_seconds=${CX_FAILURE_PAUSE_SECONDS:-2}
session_pattern='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'

# codex-mgr list marks the active profile as "  * <email>".
active_profile() {
    "$codex_mgr_command" list 2>/dev/null | sed -n 's/^  \* //p' || true
}

stay_on_current_profile() {
    reason=$1
    active=$(active_profile)
    printf 'cx: %s; staying on the current profile%s\n' "$reason" "${active:+ ($active)}" >&2
    sleep "$failure_pause_seconds"
}

usage() {
    printf 'Usage: cx [email] [session-id] [codex args...]\n'
    printf '  email       switch to that codex-mgr profile\n'
    printf '              (default: pick the profile by remaining quota)\n'
    printf '  session-id  resume that session\n'
    printf '  codex args  passed to codex; see codex --help\n'
}

profile=""
case "${1:-}" in
    -h | --help)
        usage
        exit 0
        ;;
    *@*)
        profile=$1
        shift
        ;;
esac

session=""
if [ -n "${1:-}" ] && printf '%s' "$1" | grep -Eq "$session_pattern"; then
    session=$1
    shift
fi

if [ -z "$profile" ]; then
    profile=$("$select_account_script" --codex) || profile=""
    if [ -z "$profile" ]; then
        stay_on_current_profile "no profile selected"
    fi
fi

if [ -n "$profile" ]; then
    if [ "$profile" = "$(active_profile)" ]; then
        printf 'cx: already on profile %s\n' "$profile" >&2
    elif ! "$codex_mgr_command" load "$profile"; then
        stay_on_current_profile "switch to $profile failed"
    fi
fi

if [ -n "$session" ]; then
    exec "$codex_command" resume "$session" "$@"
fi

exec "$codex_command" "$@"
