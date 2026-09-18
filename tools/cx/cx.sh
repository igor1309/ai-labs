#!/bin/sh
set -eu

# cx [-y] [email] [session-id] [codex args...]
#
# Launches Codex on a codex-mgr profile:
# - an email switches to that profile;
# - otherwise the profile is picked by account-rotation/select-account.sh --codex,
#   and cx waits for Enter before switching (any other key cancels; -y skips);
# - a session ID resumes that session.
# A failed selection or switch is reported and codex still starts on the
# current profile, after the same confirmation.
# Confirmation needs a terminal on stdin; without one, cx does not wait.

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
newline='
'
carriage_return=$(printf '\r')

# codex-mgr list marks the active profile as "  * <email>".
active_profile() {
    "$codex_mgr_command" list 2>/dev/null | sed -n 's/^  \* //p' || true
}

# Reads one keypress into $key, without waiting for Enter on a terminal.
# End of input leaves $key empty.
read_key() {
    if [ -t 0 ]; then
        saved_tty=$(stty -g)
        trap 'stty "$saved_tty"; printf "\n" >&2; exit 130' INT TERM
        stty -icanon -echo min 1 time 0
    fi
    key=$(dd bs=1 count=1 2>/dev/null; printf x)
    key=${key%x}
    if [ -t 0 ]; then
        stty "$saved_tty"
        trap - INT TERM
    fi
}

# Asks to continue: Enter continues, any other key cancels without switching
# or starting codex. Does nothing when not confirming.
confirm() {
    [ "$confirm" = "yes" ] || return 0
    printf 'cx: %s Enter to continue, any other key to cancel ' "$1" >&2
    read_key
    printf '\n' >&2
    case "$key" in
        "$newline" | "$carriage_return") ;;
        *)
            printf 'cx: cancelled\n' >&2
            exit 1
            ;;
    esac
}

stay_on_current_profile() {
    reason=$1
    active=$(active_profile)
    printf 'cx: %s; staying on the current profile%s\n' "$reason" "${active:+ ($active)}" >&2
    if [ "$confirm" = "yes" ]; then
        confirm "Start codex?"
    else
        sleep "$failure_pause_seconds"
    fi
}

usage() {
    printf 'Usage: cx [-y] [email] [session-id] [codex args...]\n'
    printf '  -y, --yes   start without asking for confirmation\n'
    printf '  email       switch to that codex-mgr profile\n'
    printf '              (default: pick the profile by remaining quota, then ask to\n'
    printf '              confirm: Enter continues, any other key cancels)\n'
    printf '  session-id  resume that session\n'
    printf '  codex args  passed to codex; see codex --help\n'
}

# CX_FORCE_CONFIRM=1 asks even when stdin is not a terminal (for tests).
confirm=yes
if [ ! -t 0 ] && [ "${CX_FORCE_CONFIRM:-}" != "1" ]; then
    confirm=no
fi
case "${1:-}" in
    -y | --yes)
        confirm=no
        shift
        ;;
esac

profile=""
case "${1:-}" in
    -h | --help)
        usage
        exit 0
        ;;
    */*@* | *@*/*)
        # Profiles are directories under the codex-mgr profiles dir.
        printf 'cx: invalid profile %s\n' "$1" >&2
        exit 2
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

# Only a profile picked by quota is confirmed; a given email already is.
selected=no
if [ -z "$profile" ]; then
    selected=yes
    profile=$("$select_account_script" --codex) || profile=""
    if [ -z "$profile" ]; then
        stay_on_current_profile "no profile selected"
    fi
fi

if [ -n "$profile" ]; then
    if [ "$profile" = "$(active_profile)" ]; then
        printf 'cx: already on profile %s\n' "$profile" >&2
        [ "$selected" = "no" ] || confirm "Start codex?"
    else
        [ "$selected" = "no" ] || confirm "Switch to $profile and start codex?"
        if ! "$codex_mgr_command" load "$profile"; then
            stay_on_current_profile "switch to $profile failed"
        fi
    fi
fi

if [ -n "$session" ]; then
    exec "$codex_command" resume "$session" "$@"
fi

exec "$codex_command" "$@"
