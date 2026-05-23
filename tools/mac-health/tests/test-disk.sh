#!/bin/sh
set -eu

test_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
. "$test_dir/lib/test-common.sh"

check=$(mh_check_script disk)

# Test 6 (spec): status thresholds at 15% and 5%.
# Boundary tests: free_pct 14 -> warn, 15 -> ok, 4 -> critical, 5 -> warn.
# free_pct = 100 - capacity. So capacity=86->14% free->warn; capacity=85->15% free->ok;
# capacity=96->4%->critical; capacity=95->5%->warn.

run_disk_for_capacity() {
    capacity=$1
    mh_setup_sandbox
    # Avail bytes don't matter for status; use a plausible value.
    mh_mock_df 50000000 "$capacity"
    mh_mock_terminal_notifier 0
    "$check"
    line=$(tail -n 1 "$sandbox_log")
    mh_cleanup_sandbox
    printf '%s' "$line"
}

mh_start_test "disk: free_pct=15 -> ok"
line=$(run_disk_for_capacity 85)
mh_assert_contains '"status":"ok"' "$line" "free_pct=15"
mh_assert_contains '"free_pct":15' "$line" "free_pct value"

mh_start_test "disk: free_pct=14 -> warn"
line=$(run_disk_for_capacity 86)
mh_assert_contains '"status":"warn"' "$line" "free_pct=14"

mh_start_test "disk: free_pct=5 -> warn"
line=$(run_disk_for_capacity 95)
mh_assert_contains '"status":"warn"' "$line" "free_pct=5"

mh_start_test "disk: free_pct=4 -> critical"
line=$(run_disk_for_capacity 96)
mh_assert_contains '"status":"critical"' "$line" "free_pct=4"

# Test 7 (spec): notification fires on ok->warn and on warn->critical.
mh_start_test "disk: notification fires on ok->warn"
mh_setup_sandbox
mh_mock_df 50000000 86
mh_mock_terminal_notifier 0
mh_seed_log '{"ts":"t","check":"disk","status":"ok","free_gb":300,"free_pct":50}'
"$check"
mh_assert_equal 1 "$(mh_notifier_call_count)" "notifier calls on ok->warn"
mh_cleanup_sandbox

mh_start_test "disk: notification fires on warn->critical"
mh_setup_sandbox
mh_mock_df 10000000 96
mh_mock_terminal_notifier 0
mh_seed_log '{"ts":"t","check":"disk","status":"warn","free_gb":50,"free_pct":10}'
"$check"
mh_assert_equal 1 "$(mh_notifier_call_count)" "notifier calls on warn->critical"
mh_cleanup_sandbox

# Test 8 (spec): notification does NOT fire on warn->warn or critical->critical.
mh_start_test "disk: no notification on warn->warn"
mh_setup_sandbox
mh_mock_df 50000000 86
mh_mock_terminal_notifier 0
mh_seed_log '{"ts":"t","check":"disk","status":"warn","free_gb":60,"free_pct":12}'
"$check"
mh_assert_equal 0 "$(mh_notifier_call_count)" "notifier calls on warn->warn"
mh_cleanup_sandbox

mh_start_test "disk: no notification on critical->critical"
mh_setup_sandbox
mh_mock_df 10000000 96
mh_mock_terminal_notifier 0
mh_seed_log '{"ts":"t","check":"disk","status":"critical","free_gb":20,"free_pct":3}'
"$check"
mh_assert_equal 0 "$(mh_notifier_call_count)" "notifier calls on critical->critical"
mh_cleanup_sandbox

# Test 13 (spec, scoped to disk): first-ever run with bad state still notifies.
mh_start_test "disk: first-ever run with critical state notifies"
mh_setup_sandbox
mh_mock_df 10000000 96
mh_mock_terminal_notifier 0
"$check"
mh_assert_equal 1 "$(mh_notifier_call_count)" "notifier calls on empty-log + critical"
mh_cleanup_sandbox

# Test 14 (spec): notifier failure does not prevent log line write.
mh_start_test "disk: notifier failure does not prevent log line write"
mh_setup_sandbox
mh_mock_df 10000000 96
mh_mock_terminal_notifier 1
"$check"
mh_assert_file_lines 1 "$sandbox_log"
mh_cleanup_sandbox

mh_print_summary "test-disk.sh"
