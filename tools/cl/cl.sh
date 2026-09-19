#!/bin/sh
set -eu

# cl [-y] [-f] [email|account-number] [session-id] [claude args...]
#
# Launches Claude Code on a ccswitch-managed account:
# - an email or account number switches to that account;
# - otherwise the account is picked by account-rotation/select-account.sh,
#   and cl waits for Enter before switching (any other key cancels; -y skips);
# - -f skips the quota query and the switch, starting claude on the current
#   account; with an email or account number it only implies -y;
# - a session ID resumes that session.
# A failed selection or switch is reported and claude still starts on the
# current account, after the same confirmation.
# Confirmation needs a terminal on stdin; without one, cl does not wait.

script_path=$0
while [ -L "$script_path" ]; do
    link_target=$(readlink "$script_path")
    case "$link_target" in
        /*) script_path=$link_target ;;
        *) script_path=$(dirname "$script_path")/$link_target ;;
    esac
done
tool_dir=$(CDPATH= cd -- "$(dirname "$script_path")" && pwd)

select_account_script=${CL_SELECT_ACCOUNT_SCRIPT:-"$tool_dir/../account-rotation/select-account.sh"}
ccswitch_command=${CL_CCSWITCH_COMMAND:-ccswitch.sh}
claude_command=${CL_CLAUDE_COMMAND:-claude}
failure_pause_seconds=${CL_FAILURE_PAUSE_SECONDS:-2}
sequence_file="$HOME/.claude-switch-backup/sequence.json"
session_pattern='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
newline='
'
carriage_return=$(printf '\r')

active_account() {
    jq -r '"\(.activeAccountNumber)\t\(.accounts[(.activeAccountNumber | tostring)].email // "")"' "$sequence_file" 2>/dev/null || true
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
# or starting claude. Does nothing when not confirming.
confirm() {
    [ "$confirm" = "yes" ] || return 0
    printf 'cl: %s Enter to continue, any other key to cancel ' "$1" >&2
    read_key
    printf '\n' >&2
    case "$key" in
        "$newline" | "$carriage_return") ;;
        *)
            printf 'cl: cancelled\n' >&2
            exit 1
            ;;
    esac
}

# "<number> (<email>)" for an account number known to ccswitch.
account_label() {
    label_email=$(jq -r --arg number "$1" '.accounts[$number].email // empty' "$sequence_file" 2>/dev/null || true)
    printf '%s%s' "$1" "${label_email:+ ($label_email)}"
}

# Claude resolves --resume within the current project. Find the transcript and
# return its recorded working directory so a session can be resumed from any
# directory where cl is invoked.
session_working_directory() {
    projects_dir="$HOME/.claude/projects"
    [ -d "$projects_dir" ] || return 0

    transcript=$(find "$projects_dir" -mindepth 2 -maxdepth 2 -type f -name "$1.jsonl" -print -quit 2>/dev/null || true)
    [ -n "$transcript" ] || return 0

    head -n 1 "$transcript" | jq -r '.cwd // empty' 2>/dev/null || true
}

stay_on_current_account() {
    reason=$1
    active_email=$(active_account | cut -f 2)
    printf 'cl: %s; staying on the current account%s\n' "$reason" "${active_email:+ ($active_email)}" >&2
    if [ "$confirm" = "yes" ]; then
        confirm "Start claude?"
    else
        sleep "$failure_pause_seconds"
    fi
}

usage() {
    printf 'Usage: cl [-y] [-f] [email|account-number] [session-id] [claude args...]\n'
    printf '  -y, --yes                start without asking for confirmation\n'
    printf '  -f, --fast               start on the current account at once: no quota\n'
    printf '                           query, no switch, no confirmation\n'
    printf '  email or account number  switch to that account\n'
    printf '                           (default: pick the account by remaining quota,\n'
    printf '                           then ask to confirm: Enter continues, any other\n'
    printf '                           key cancels)\n'
    printf '  session-id               resume that session\n'
    printf '  claude args              passed to claude; see claude --help\n'
}

# CL_FORCE_CONFIRM=1 asks even when stdin is not a terminal (for tests).
confirm=yes
if [ ! -t 0 ] && [ "${CL_FORCE_CONFIRM:-}" != "1" ]; then
    confirm=no
fi
fast=no
while :; do
    case "${1:-}" in
        -y | --yes)
            confirm=no
            shift
            ;;
        -f | --fast)
            fast=yes
            confirm=no
            shift
            ;;
        *) break ;;
    esac
done

account=""
case "${1:-}" in
    -h | --help)
        usage
        exit 0
        ;;
    *@*)
        account=$1
        shift
        ;;
    '' | *[!0-9]*) ;;
    *)
        account=$1
        shift
        ;;
esac

session=""
if [ -n "${1:-}" ] && printf '%s' "$1" | grep -Eq "$session_pattern"; then
    session=$1
    shift
fi

# Only an account picked by quota is confirmed; a given one already is.
# -f leaves the account empty, so the switch below is skipped too.
selected=no
if [ -z "$account" ] && [ "$fast" = "no" ]; then
    selected=yes
    account=$("$select_account_script") || account=""
    if [ -z "$account" ]; then
        stay_on_current_account "no account selected"
    fi
fi

if [ -n "$account" ]; then
    active=$(active_account)
    active_number=$(printf '%s' "$active" | cut -f 1)
    active_email=$(printf '%s' "$active" | cut -f 2)

    if [ "$account" = "$active_number" ] || [ "$account" = "$active_email" ]; then
        printf 'cl: already on account %s (%s)\n' "$active_number" "$active_email" >&2
        [ "$selected" = "no" ] || confirm "Start claude?"
    else
        [ "$selected" = "no" ] || confirm "Switch to account $(account_label "$account") and start claude?"
        if ! "$ccswitch_command" --switch-to "$account"; then
            stay_on_current_account "switch to $account failed"
        fi
    fi
fi

if [ -n "$session" ]; then
    session_cwd=$(session_working_directory "$session")
    if [ -n "$session_cwd" ] && [ -d "$session_cwd" ]; then
        cd "$session_cwd"
    fi
    exec "$claude_command" --resume "$session" "$@"
fi

exec "$claude_command" "$@"
