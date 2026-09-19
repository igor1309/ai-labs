#!/bin/sh
set -eu

tool_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
script_path="$tool_dir/cx.sh"

case "${1:-}" in
    '') ;;
    -h | --help)
        printf 'Usage: %s\n' "$0"
        printf '  runs the cx tests with mocks; prints ok on success\n'
        exit 0
        ;;
    *)
        printf 'Usage: %s\n' "$0" >&2
        exit 2
        ;;
esac

session_id="019a2b3c-4d5e-7f60-8a9b-0c1d2e3f4a5b"

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

# run_cx <selected profile or "none"> <load result: ok|fail> [cx args...]
# Prints the exit code, stderr, and the log of select/codex-mgr load/codex calls.
# The active profile is active@example.com. stdin is not a terminal, so cx does
# not ask for confirmation unless $confirm_keys is set: then confirmation is
# forced and $confirm_keys is the typed input.
run_cx() {
    selected_profile=$1
    load_result=$2
    shift 2

    scenario_dir=$(mktemp -d)
    : >"$scenario_dir/log"
    force_confirm=""
    printf '%s' "${confirm_keys-}" >"$scenario_dir/stdin"
    [ -z "${confirm_keys+set}" ] || force_confirm=1

    if [ "$selected_profile" = "none" ]; then
        printf '#!/bin/sh\nprintf "select %%s\\n" "$*" >>"%s/log"\nexit 1\n' "$scenario_dir" >"$scenario_dir/select"
    else
        printf '#!/bin/sh\nprintf "select %%s\\n" "$*" >>"%s/log"\nprintf "%s\\n"\n' "$scenario_dir" "$selected_profile" >"$scenario_dir/select"
    fi
    load_exit=0
    [ "$load_result" = "ok" ] || load_exit=1
    cat <<__CODEX_MGR__ >"$scenario_dir/codex-mgr"
#!/bin/sh
case "\$1" in
    list) printf 'Codex Profiles\n--------------\n  * active@example.com\n    other@example.com\n' ;;
    *)
        printf 'codex-mgr %s\n' "\$*" >>"$scenario_dir/log"
        exit $load_exit
        ;;
esac
__CODEX_MGR__
    printf '#!/bin/sh\nprintf "codex %%s\\n" "$*" >>"%s/log"\n' "$scenario_dir" >"$scenario_dir/codex"
    chmod +x "$scenario_dir/select" "$scenario_dir/codex-mgr" "$scenario_dir/codex"

    set +e
    CX_SELECT_ACCOUNT_SCRIPT="$scenario_dir/select" \
        CX_CODEX_MGR_COMMAND="$scenario_dir/codex-mgr" \
        CX_CODEX_COMMAND="$scenario_dir/codex" \
        CX_FAILURE_PAUSE_SECONDS=0 \
        CX_FORCE_CONFIRM="$force_confirm" \
        sh "$script_path" "$@" <"$scenario_dir/stdin" >/dev/null 2>"$scenario_dir/stderr"
    exit_code=$?
    set -e

    printf 'exit=%s\nstderr:\n%s\nlog:\n%s' "$exit_code" "$(cat "$scenario_dir/stderr")" "$(cat "$scenario_dir/log")"
    rm -rf "$scenario_dir"
}

# No profile: the selected profile is loaded.
assert_equal "exit=0
stderr:

log:
select --codex
codex-mgr load other@example.com
codex " "$(run_cx other@example.com ok)"

# No profile, and the selected profile is already active: no switch.
assert_equal "exit=0
stderr:
cx: already on profile active@example.com
log:
select --codex
codex --model gpt-5" "$(run_cx active@example.com ok --model gpt-5)"

# Email: loaded directly, without selection.
assert_equal "exit=0
stderr:

log:
codex-mgr load other@example.com
codex " "$(run_cx none ok other@example.com)"

# Session without profile: selected profile, then resume.
assert_equal "exit=0
stderr:

log:
select --codex
codex-mgr load other@example.com
codex resume $session_id --model gpt-5" "$(run_cx other@example.com ok "$session_id" --model gpt-5)"

# Email and session.
assert_equal "exit=0
stderr:

log:
codex-mgr load other@example.com
codex resume $session_id" "$(run_cx none ok other@example.com "$session_id")"

# Other arguments go to codex as they are.
assert_equal "exit=0
stderr:

log:
select --codex
codex-mgr load other@example.com
codex exec fix the tests" "$(run_cx other@example.com ok exec "fix the tests")"

# No eligible profile: codex still starts on the current profile.
assert_equal "exit=0
stderr:
cx: no profile selected; staying on the current profile (active@example.com)
log:
select --codex
codex " "$(run_cx none ok)"

# Failed switch: codex still starts on the current profile.
assert_equal "exit=0
stderr:
cx: switch to other@example.com failed; staying on the current profile (active@example.com)
log:
codex-mgr load other@example.com
codex " "$(run_cx none fail other@example.com)"

# A profile containing "/" is rejected before anything runs.
for bad_profile in ../../outside@example.com /tmp/outside@example.com nested/me@example.com me@example.com/..; do
    bad_output=$(run_cx other@example.com ok "$bad_profile")
    assert_equal "exit=2
stderr:
cx: invalid profile $bad_profile
log:" "$bad_output"
done

# Confirmation, for a profile picked by quota.
enter='
'
prompt_suffix="Enter to continue, any other key to cancel "

# Enter: the selected profile is loaded.
assert_equal "exit=0
stderr:
cx: Switch to other@example.com and start codex? $prompt_suffix
log:
select --codex
codex-mgr load other@example.com
codex resume $session_id" "$(confirm_keys=$enter run_cx other@example.com ok "$session_id")"

# Any other key: nothing is switched or started.
assert_equal "exit=1
stderr:
cx: Switch to other@example.com and start codex? $prompt_suffix
cx: cancelled
log:
select --codex" "$(confirm_keys=n run_cx other@example.com ok)"

# End of input cancels too.
assert_equal "exit=1
stderr:
cx: Switch to other@example.com and start codex? $prompt_suffix
cx: cancelled
log:
select --codex" "$(confirm_keys= run_cx other@example.com ok)"

# Already active: asks before starting.
assert_equal "exit=0
stderr:
cx: already on profile active@example.com
cx: Start codex? $prompt_suffix
log:
select --codex
codex " "$(confirm_keys=$enter run_cx active@example.com ok)"

# No eligible profile: asks before starting on the current profile.
assert_equal "exit=1
stderr:
cx: no profile selected; staying on the current profile (active@example.com)
cx: Start codex? $prompt_suffix
cx: cancelled
log:
select --codex" "$(confirm_keys=q run_cx none ok)"

# A given email is not confirmed.
assert_equal "exit=0
stderr:

log:
codex-mgr load other@example.com
codex " "$(confirm_keys= run_cx none ok other@example.com)"

# ...unless its switch fails.
assert_equal "exit=0
stderr:
cx: switch to other@example.com failed; staying on the current profile (active@example.com)
cx: Start codex? $prompt_suffix
log:
codex-mgr load other@example.com
codex " "$(confirm_keys=$enter run_cx none fail other@example.com)"

# -y / --yes: no confirmation; the rest is parsed as usual.
for yes_flag in -y --yes; do
    assert_equal "exit=0
stderr:

log:
select --codex
codex-mgr load other@example.com
codex resume $session_id --model gpt-5" "$(confirm_keys= run_cx other@example.com ok "$yes_flag" "$session_id" --model gpt-5)"
done

# -f / --fast: no quota query and no switch; the rest is parsed as usual.
for fast_flag in -f --fast; do
    assert_equal "exit=0
stderr:

log:
codex resume $session_id --model gpt-5" "$(confirm_keys= run_cx other@example.com ok "$fast_flag" "$session_id" --model gpt-5)"
done

# -f does not confirm, even on a terminal.
assert_equal "exit=0
stderr:

log:
codex " "$(confirm_keys=q run_cx other@example.com ok -f)"

# -f still switches to a given profile: it only skips the quota query.
assert_equal "exit=0
stderr:

log:
codex-mgr load other@example.com
codex " "$(confirm_keys= run_cx none ok -f other@example.com)"

# -y and -f combine, in either order.
for flag_order in "-y -f" "-f -y"; do
    assert_equal "exit=0
stderr:

log:
codex " "$(confirm_keys= run_cx other@example.com ok $flag_order)"
done

# Help: printed without selecting, switching, or starting codex.
for help_flag in -h --help; do
    help_output=$(CX_SELECT_ACCOUNT_SCRIPT=false CX_CODEX_MGR_COMMAND=false CX_CODEX_COMMAND=false sh "$script_path" "$help_flag")
    assert_equal "Usage: cx [-y] [-f] [email] [session-id] [codex args...]" "$(printf '%s\n' "$help_output" | head -n 1)"
done

printf 'ok\n'
