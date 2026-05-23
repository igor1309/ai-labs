#!/bin/sh
# Shared test helpers for mac-health.
# Provides assertions, sandbox setup, and system-tool mocks.

# Track failures across a single test file.
mh_test_failures=0
mh_test_count=0
mh_current_test=""

mh_start_test() {
    mh_current_test=$1
    mh_test_count=$(( mh_test_count + 1 ))
}

mh_fail() {
    message=$1
    printf '  [FAIL] %s: %s\n' "$mh_current_test" "$message" >&2
    mh_test_failures=$(( mh_test_failures + 1 ))
}

mh_assert_equal() {
    expected=$1
    actual=$2
    label=${3:-value}

    if [ "$expected" = "$actual" ]; then
        return 0
    fi

    mh_fail "$label expected [$expected], got [$actual]"
    return 1
}

mh_assert_contains() {
    needle=$1
    haystack=$2
    label=${3:-text}

    case "$haystack" in
        *"$needle"*) return 0 ;;
    esac

    mh_fail "$label does not contain [$needle]; got [$haystack]"
    return 1
}

mh_assert_file_lines() {
    expected_lines=$1
    file_path=$2

    if [ ! -f "$file_path" ]; then
        mh_fail "file $file_path does not exist"
        return 1
    fi
    actual_lines=$(wc -l <"$file_path" | tr -d ' ')
    mh_assert_equal "$expected_lines" "$actual_lines" "line count of $file_path"
}

mh_print_summary() {
    file_name=$1
    if [ "$mh_test_failures" -eq 0 ]; then
        printf '%s: %s tests passed\n' "$file_name" "$mh_test_count"
        return 0
    fi
    printf '%s: %s of %s tests FAILED\n' "$file_name" "$mh_test_failures" "$mh_test_count" >&2
    return 1
}

# mh_setup_sandbox — creates a tmp sandbox under $sandbox; sets:
#   $sandbox            (root)
#   $sandbox_bin        (mock binary dir, prepended to PATH)
#   $sandbox_log        (log file path)
#   $sandbox_home       (synthetic HOME)
#   $sandbox_calls      (call-log dir for mocks)
# Exports MAC_HEALTH_LOG_FILE, HOME, PATH.
mh_setup_sandbox() {
    sandbox=$(mktemp -d -t mac-health-test.XXXXXX)
    sandbox_bin="$sandbox/bin"
    sandbox_log="$sandbox/log/health.log"
    sandbox_home="$sandbox/home"
    sandbox_calls="$sandbox/calls"

    mkdir -p "$sandbox_bin" "$sandbox_home" "$sandbox_calls"

    MAC_HEALTH_LOG_FILE="$sandbox_log"
    HOME="$sandbox_home"
    PATH="$sandbox_bin:$PATH"
    MH_CALLS_DIR="$sandbox_calls"

    export MAC_HEALTH_LOG_FILE HOME PATH MH_CALLS_DIR
}

mh_cleanup_sandbox() {
    [ -n "${sandbox:-}" ] && [ -d "$sandbox" ] && rm -rf "$sandbox"
    unset MAC_HEALTH_LOG_FILE MH_CALLS_DIR
}

# mh_seed_log <line>... — append each arg as a literal line to the log.
mh_seed_log() {
    mkdir -p "$(dirname "$sandbox_log")"
    for line in "$@"; do
        printf '%s\n' "$line" >>"$sandbox_log"
    done
}

# Mock writers. Each writes a script to $sandbox_bin and a marker for call tracking.

mh_mock_memory_pressure() {
    pressure_level=$1
    cat >"$sandbox_bin/memory_pressure" <<EOF
#!/bin/sh
printf 'System-wide memory pressure level: %s\n' "$pressure_level"
EOF
    chmod +x "$sandbox_bin/memory_pressure"
}

mh_mock_sysctl_swap() {
    swap_mb=$1
    cat >"$sandbox_bin/sysctl" <<EOF
#!/bin/sh
case "\$1" in
    vm.swapusage)
        printf 'vm.swapusage:  total = 2048.00M  used = %s.00M  free = 1.00M  (encrypted)\n' "$swap_mb"
        ;;
    *)
        printf 'sysctl: unknown key: %s\n' "\$1" >&2; exit 1 ;;
esac
EOF
    chmod +x "$sandbox_bin/sysctl"
}

mh_mock_df() {
    avail_kb=$1
    capacity_pct=$2
    cat >"$sandbox_bin/df" <<EOF
#!/bin/sh
printf 'Filesystem  1024-blocks  Used  Available  Capacity  iused  ifree  %%iused  Mounted on\n'
printf '/dev/disk1s5  500000000  100000000  %s  %s%%  100  900  10%%  /\n' "$avail_kb" "$capacity_pct"
EOF
    chmod +x "$sandbox_bin/df"
}

mh_mock_du() {
    # du: emit a stable size of 10 (KB) for any input.
    cat >"$sandbox_bin/du" <<'EOF'
#!/bin/sh
# Skip flags; the path is the last argument.
shift $(( $# - 1 )) 2>/dev/null || true
printf '10\t%s\n' "${1:-?}"
EOF
    chmod +x "$sandbox_bin/du"
}

# Writes a terminal-notifier mock that records each invocation.
# Optional arg: exit_code (default 0).
mh_mock_terminal_notifier() {
    exit_code=${1:-0}
    cat >"$sandbox_bin/terminal-notifier" <<EOF
#!/bin/sh
printf '%s\n' "\$*" >>"\$MH_CALLS_DIR/terminal-notifier.log"
exit $exit_code
EOF
    chmod +x "$sandbox_bin/terminal-notifier"
}

mh_notifier_call_count() {
    log="$sandbox_calls/terminal-notifier.log"
    if [ -f "$log" ]; then
        wc -l <"$log" | tr -d ' '
    else
        printf '0'
    fi
}

# Returns the script path for a check, relative to this file's repo location.
mh_check_script() {
    name=$1
    # tests/lib/test-common.sh -> tools/mac-health/checks/
    here=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
    printf '%s/../checks/check-%s.sh' "$here" "$name"
}
