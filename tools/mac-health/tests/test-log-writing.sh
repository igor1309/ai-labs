#!/bin/sh
set -eu

test_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
. "$test_dir/lib/test-common.sh"

check=$(mh_check_script disk)

# Test 11 (spec): appends, does not truncate. Two consecutive runs leave two lines.
mh_start_test "log writing: two runs leave two lines"
mh_setup_sandbox
mh_mock_df 50000000 50
mh_mock_terminal_notifier 0
"$check"
"$check"
mh_assert_file_lines 2 "$sandbox_log"
mh_cleanup_sandbox

# Test 12 (spec): creates log directory on first run when absent.
mh_start_test "log writing: creates log dir when absent"
mh_setup_sandbox
mh_mock_df 50000000 50
mh_mock_terminal_notifier 0
# Confirm parent dir does not exist before the run.
log_dir=$(dirname "$sandbox_log")
if [ -d "$log_dir" ]; then
    rmdir "$log_dir"
fi
[ ! -d "$log_dir" ] || mh_fail "precondition: log dir should not exist"
"$check"
[ -d "$log_dir" ] || mh_fail "log dir was not created"
mh_assert_file_lines 1 "$sandbox_log"
mh_cleanup_sandbox

mh_print_summary "test-log-writing.sh"
