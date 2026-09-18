#!/bin/sh
set -eu

# cl [email|account-number] [session-id] [claude args...]
#
# Launches Claude Code on a ccswitch-managed account:
# - an email or account number switches to that account;
# - otherwise the account is picked by account-rotation/select-account.sh;
# - a session ID resumes that session.
# A failed selection or switch is reported and claude still starts on the
# current account.

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

active_account() {
    jq -r '"\(.activeAccountNumber)\t\(.accounts[(.activeAccountNumber | tostring)].email // "")"' "$sequence_file" 2>/dev/null || true
}

stay_on_current_account() {
    reason=$1
    active_email=$(active_account | cut -f 2)
    printf 'cl: %s; staying on the current account%s\n' "$reason" "${active_email:+ ($active_email)}" >&2
    sleep "$failure_pause_seconds"
}

usage() {
    printf 'Usage: cl [email|account-number] [session-id] [claude args...]\n'
    printf '  email or account number  switch to that account\n'
    printf '                           (default: pick the account by remaining quota)\n'
    printf '  session-id               resume that session\n'
    printf '  claude args              passed to claude; see claude --help\n'
}

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

if [ -z "$account" ]; then
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
    elif ! "$ccswitch_command" --switch-to "$account"; then
        stay_on_current_account "switch to $account failed"
    fi
fi

if [ -n "$session" ]; then
    exec "$claude_command" --resume "$session" "$@"
fi

exec "$claude_command" "$@"
