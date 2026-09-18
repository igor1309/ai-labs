#!/bin/sh
set -eu

tool_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
script_path="$tool_dir/cx.sh"
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
# The active profile is active@example.com.
run_cx() {
    selected_profile=$1
    load_result=$2
    shift 2

    scenario_dir=$(mktemp -d)

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
        sh "$script_path" "$@" >/dev/null 2>"$scenario_dir/stderr"
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

# Help: printed without selecting, switching, or starting codex.
for help_flag in -h --help; do
    help_output=$(CX_SELECT_ACCOUNT_SCRIPT=false CX_CODEX_MGR_COMMAND=false CX_CODEX_COMMAND=false sh "$script_path" "$help_flag")
    assert_equal "Usage: cx [email] [session-id] [codex args...]" "$(printf '%s\n' "$help_output" | head -n 1)"
done

printf 'ok\n'
