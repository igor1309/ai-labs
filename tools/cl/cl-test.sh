#!/bin/sh
set -eu

tool_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
script_path="$tool_dir/cl.sh"

case "${1:-}" in
    '') ;;
    -h | --help)
        printf 'Usage: %s\n' "$0"
        printf '  runs the cl tests with mocks; prints ok on success\n'
        exit 0
        ;;
    *)
        printf 'Usage: %s\n' "$0" >&2
        exit 2
        ;;
esac

session_id="33b61934-2a6a-46e1-8380-8fce55ef8c09"

assert_equal() {
    expected=$1
    actual=$2

    if [ "$actual" = "$expected" ]; then
        return
    fi

    printf 'expected:\n%s\n' "$expected" >&2
    printf 'actual:\n%s\n' "$actual" >&2
    exit 1
}

# run_cl <selected account or "none"> <switch result: ok|fail> [cl args...]
# Prints the exit code, stderr, and the log of select/ccswitch/claude calls.
run_cl() {
    selected_account=$1
    switch_result=$2
    shift 2

    scenario_dir=$(mktemp -d)
    mkdir -p "$scenario_dir/home/.claude-switch-backup"
    cat <<'__SEQUENCE__' >"$scenario_dir/home/.claude-switch-backup/sequence.json"
{
  "activeAccountNumber": 22,
  "sequence": [19, 22],
  "accounts": {
    "19": { "email": "other@example.com" },
    "22": { "email": "active@example.com" }
  }
}
__SEQUENCE__

    if [ "$selected_account" = "none" ]; then
        printf '#!/bin/sh\nprintf "select\\n" >>"%s/log"\nexit 1\n' "$scenario_dir" >"$scenario_dir/select"
    else
        printf '#!/bin/sh\nprintf "select\\n" >>"%s/log"\nprintf "%s\\n"\n' "$scenario_dir" "$selected_account" >"$scenario_dir/select"
    fi
    if [ "$switch_result" = "ok" ]; then
        printf '#!/bin/sh\nprintf "ccswitch %%s\\n" "$*" >>"%s/log"\n' "$scenario_dir" >"$scenario_dir/ccswitch"
    else
        printf '#!/bin/sh\nprintf "ccswitch %%s\\n" "$*" >>"%s/log"\nexit 1\n' "$scenario_dir" >"$scenario_dir/ccswitch"
    fi
    printf '#!/bin/sh\nprintf "claude %%s\\n" "$*" >>"%s/log"\n' "$scenario_dir" >"$scenario_dir/claude"
    chmod +x "$scenario_dir/select" "$scenario_dir/ccswitch" "$scenario_dir/claude"

    set +e
    HOME="$scenario_dir/home" \
        CL_SELECT_ACCOUNT_SCRIPT="$scenario_dir/select" \
        CL_CCSWITCH_COMMAND="$scenario_dir/ccswitch" \
        CL_CLAUDE_COMMAND="$scenario_dir/claude" \
        CL_FAILURE_PAUSE_SECONDS=0 \
        sh "$script_path" "$@" >/dev/null 2>"$scenario_dir/stderr"
    exit_code=$?
    set -e

    printf 'exit=%s\nstderr:\n%s\nlog:\n%s' "$exit_code" "$(cat "$scenario_dir/stderr")" "$(cat "$scenario_dir/log")"
    rm -rf "$scenario_dir"
}

# No account: the selected account is switched to.
assert_equal "exit=0
stderr:

log:
select
ccswitch --switch-to 19
claude " "$(run_cl 19 ok)"

# No account, and the selected account is already active: no switch.
assert_equal "exit=0
stderr:
cl: already on account 22 (active@example.com)
log:
select
claude --model opus" "$(run_cl 22 ok --model opus)"

# Email: switched to directly, without selection.
assert_equal "exit=0
stderr:

log:
ccswitch --switch-to other@example.com
claude " "$(run_cl none ok other@example.com)"

# Account number: switched to directly, without selection.
assert_equal "exit=0
stderr:

log:
ccswitch --switch-to 19
claude " "$(run_cl none ok 19)"

# Session without account: selected account, then resume.
assert_equal "exit=0
stderr:

log:
select
ccswitch --switch-to 19
claude --resume $session_id --model opus" "$(run_cl 19 ok "$session_id" --model opus)"

# Email and session.
assert_equal "exit=0
stderr:

log:
ccswitch --switch-to other@example.com
claude --resume $session_id" "$(run_cl none ok other@example.com "$session_id")"

# No eligible account: claude still starts on the current account.
assert_equal "exit=0
stderr:
cl: no account selected; staying on the current account (active@example.com)
log:
select
claude " "$(run_cl none ok)"

# Failed switch: claude still starts on the current account.
assert_equal "exit=0
stderr:
cl: switch to other@example.com failed; staying on the current account (active@example.com)
log:
ccswitch --switch-to other@example.com
claude " "$(run_cl none fail other@example.com)"

# Help: printed without selecting, switching, or starting claude.
for help_flag in -h --help; do
    help_output=$(CL_SELECT_ACCOUNT_SCRIPT=false CL_CCSWITCH_COMMAND=false CL_CLAUDE_COMMAND=false sh "$script_path" "$help_flag")
    assert_equal "Usage: cl [email|account-number] [session-id] [claude args...]" "$(printf '%s\n' "$help_output" | head -n 1)"
done

printf 'ok\n'
